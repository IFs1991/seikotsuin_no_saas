[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet('PROTECT_AND_CAPTURE', 'CAPTURE')]
  [string]$Mode,

  [Parameter(Mandatory)]
  [ValidateSet('FILE', 'DIRECTORY')]
  [string]$Kind,

  [Parameter(Mandatory)]
  [string]$LiteralPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$pathItem = Get-Item -LiteralPath $LiteralPath -Force
if (
  ($pathItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
  ($Kind -eq 'DIRECTORY' -and -not $pathItem.PSIsContainer) -or
  ($Kind -eq 'FILE' -and $pathItem.PSIsContainer)
) {
  throw 'PATH_KIND_OR_REPARSE_INVALID'
}

$currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
if ($null -eq $currentSid) {
  throw 'CURRENT_USER_SID_UNAVAILABLE'
}
$systemSid = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
if ($currentSid.Value -eq $systemSid.Value) {
  throw 'CURRENT_USER_MUST_NOT_BE_SYSTEM'
}

function Get-ReceiptAccessControl {
  param(
    [Parameter(Mandatory)][string]$Value,
    [Parameter(Mandatory)][string]$ValueKind
  )

  if ($ValueKind -eq 'DIRECTORY') {
    return [IO.FileSystemAclExtensions]::GetAccessControl(
      [IO.DirectoryInfo]::new($Value),
      [Security.AccessControl.AccessControlSections]::Owner -bor
        [Security.AccessControl.AccessControlSections]::Access
    )
  }

  return [IO.FileSystemAclExtensions]::GetAccessControl(
    [IO.FileInfo]::new($Value),
    [Security.AccessControl.AccessControlSections]::Owner -bor
      [Security.AccessControl.AccessControlSections]::Access
  )
}

function Set-ReceiptPrivateAccessControl {
  param(
    [Parameter(Mandatory)][string]$Value,
    [Parameter(Mandatory)][string]$ValueKind
  )

  if ($ValueKind -eq 'DIRECTORY') {
    $security = [Security.AccessControl.DirectorySecurity]::new()
    $inheritance = (
      [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor
      [Security.AccessControl.InheritanceFlags]::ObjectInherit
    )
  }
  else {
    $security = [Security.AccessControl.FileSecurity]::new()
    $inheritance = [Security.AccessControl.InheritanceFlags]::None
  }

  $security.SetAccessRuleProtection($true, $false)
  $security.SetOwner($currentSid)
  foreach ($sid in @($currentSid, $systemSid)) {
    $rule = [Security.AccessControl.FileSystemAccessRule]::new(
      $sid,
      [Security.AccessControl.FileSystemRights]::FullControl,
      $inheritance,
      [Security.AccessControl.PropagationFlags]::None,
      [Security.AccessControl.AccessControlType]::Allow
    )
    $null = $security.AddAccessRule($rule)
  }

  if ($ValueKind -eq 'DIRECTORY') {
    [IO.FileSystemAclExtensions]::SetAccessControl(
      [IO.DirectoryInfo]::new($Value),
      $security
    )
  }
  else {
    [IO.FileSystemAclExtensions]::SetAccessControl(
      [IO.FileInfo]::new($Value),
      $security
    )
  }
}

if ($Mode -eq 'PROTECT_AND_CAPTURE') {
  Set-ReceiptPrivateAccessControl -Value $LiteralPath -ValueKind $Kind
}

$captured = Get-ReceiptAccessControl -Value $LiteralPath -ValueKind $Kind
$owner = $captured.GetOwner(
  [Security.Principal.SecurityIdentifier]
)
if ($owner.Value -ne $currentSid.Value) {
  throw 'OWNER_SID_MISMATCH'
}
if (-not $captured.AreAccessRulesProtected) {
  throw 'ACCESS_RULES_NOT_PROTECTED'
}

$rules = @(
  $captured.GetAccessRules(
    $true,
    $true,
    [Security.Principal.SecurityIdentifier]
  )
)
if ($rules.Count -ne 2) {
  throw 'ACCESS_RULE_COUNT_INVALID'
}

$expectedInheritance = if ($Kind -eq 'DIRECTORY') {
  (
    [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor
    [Security.AccessControl.InheritanceFlags]::ObjectInherit
  )
}
else {
  [Security.AccessControl.InheritanceFlags]::None
}

$allowedSidValues = [Collections.Generic.List[string]]::new()
foreach ($rule in $rules) {
  if (
    $rule.IsInherited -or
    $rule.AccessControlType -ne
      [Security.AccessControl.AccessControlType]::Allow -or
    $rule.FileSystemRights -ne
      [Security.AccessControl.FileSystemRights]::FullControl -or
    $rule.InheritanceFlags -ne $expectedInheritance -or
    $rule.PropagationFlags -ne
      [Security.AccessControl.PropagationFlags]::None
  ) {
    throw 'ACCESS_RULE_INVALID'
  }
  $allowedSidValues.Add($rule.IdentityReference.Value)
}

$actualAllowedSids = @($allowedSidValues | Sort-Object -Unique)
$expectedAllowedSids = @(
  $currentSid.Value,
  $systemSid.Value
) | Sort-Object -Unique
if (
  $actualAllowedSids.Count -ne 2 -or
  ($actualAllowedSids -join "`n") -ne ($expectedAllowedSids -join "`n")
) {
  throw 'ACCESS_RULE_SID_SET_INVALID'
}

$sddlSections = (
  [Security.AccessControl.AccessControlSections]::Owner -bor
  [Security.AccessControl.AccessControlSections]::Access
)
$result = [ordered]@{
  schemaVersion = 1
  aclPolicyId = 'WINDOWS_CURRENT_USER_AND_SYSTEM_FULL_CONTROL_V1'
  kind = $Kind
  ownerSid = $owner.Value
  currentUserSid = $currentSid.Value
  systemSid = $systemSid.Value
  accessRulesProtected = $captured.AreAccessRulesProtected
  accessRuleCount = $rules.Count
  allowedSids = $actualAllowedSids
  sddl = $captured.GetSecurityDescriptorSddlForm($sddlSections)
}

$result | ConvertTo-Json -Compress -Depth 4
