[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$ActionId = 'PR12-ACTION-003'
$ProviderId = 'WINDOWS_DPAPI_CURRENT_USER_V1'
$Utf8Strict = [Text.UTF8Encoding]::new($false, $true)
$PlaintextBuffers = [System.Collections.Generic.List[byte[]]]::new()
$CiphertextBuffers = [System.Collections.Generic.List[byte[]]]::new()
$EntropyBuffers = [System.Collections.Generic.List[byte[]]]::new()

function Get-Sha256Hex {
  param([Parameter(Mandatory)][byte[]]$Bytes)
  return [Convert]::ToHexString(
    [Security.Cryptography.SHA256]::HashData($Bytes)
  ).ToLowerInvariant()
}

function Get-TextSha256Hex {
  param([Parameter(Mandatory)][string]$Value)
  $bytes = $Utf8Strict.GetBytes($Value)
  try {
    return Get-Sha256Hex -Bytes $bytes
  }
  finally {
    [Array]::Clear($bytes, 0, $bytes.Length)
  }
}

function Set-StrictAcl {
  param(
    [Parameter(Mandatory)][string]$Value,
    [Parameter(Mandatory)][bool]$Directory,
    [Parameter(Mandatory)][Security.Principal.SecurityIdentifier]$CurrentSid
  )
  if ($Directory) {
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
  $systemSid = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
  foreach ($sid in @($CurrentSid, $systemSid)) {
    $rule = [Security.AccessControl.FileSystemAccessRule]::new(
      $sid,
      [Security.AccessControl.FileSystemRights]::FullControl,
      $inheritance,
      [Security.AccessControl.PropagationFlags]::None,
      [Security.AccessControl.AccessControlType]::Allow
    )
    $null = $security.AddAccessRule($rule)
  }
  if ($Directory) {
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

function Write-Envelope {
  param(
    [Parameter(Mandatory)][object]$InputRecord,
    [Parameter(Mandatory)][string]$Role,
    [Parameter(Mandatory)][string]$OpaqueHandle,
    [Parameter(Mandatory)][string]$SyntheticValue,
    [Parameter(Mandatory)][string]$OwnerSidSha256,
    [Parameter(Mandatory)][string]$MachineNameSha256,
    [Parameter(Mandatory)][Security.Principal.SecurityIdentifier]$CurrentSid
  )
  $opaqueHandleSha256 = Get-TextSha256Hex -Value $OpaqueHandle
  $domain = (
    'PR12_DPAPI_ENTROPY_V1|{0}|{1}|{2}|{3}|{4}' -f
    $ActionId,
    $InputRecord.configurationId,
    $Role,
    $opaqueHandleSha256,
    $OwnerSidSha256
  )
  $domainBytes = $Utf8Strict.GetBytes($domain)
  try {
    $entropy = [Security.Cryptography.SHA256]::HashData($domainBytes)
  }
  finally {
    [Array]::Clear($domainBytes, 0, $domainBytes.Length)
  }
  $EntropyBuffers.Add($entropy)
  $plaintext = $Utf8Strict.GetBytes($SyntheticValue)
  $PlaintextBuffers.Add($plaintext)
  $ciphertext = [Security.Cryptography.ProtectedData]::Protect(
    $plaintext,
    $entropy,
    [Security.Cryptography.DataProtectionScope]::CurrentUser
  )
  $CiphertextBuffers.Add($ciphertext)
  $envelope = [ordered]@{
    actionId = $ActionId
    bootstrapScriptSha256 = $InputRecord.bootstrapScriptSha256
    ciphertextBase64 = [Convert]::ToBase64String($ciphertext)
    ciphertextSha256 = Get-Sha256Hex -Bytes $ciphertext
    configurationId = $InputRecord.configurationId
    createdAt = [DateTimeOffset]::UtcNow.ToString(
      'yyyy-MM-ddTHH:mm:ss.fffZ',
      [Globalization.CultureInfo]::InvariantCulture
    )
    encoding = 'UTF8_STRICT'
    entropy = [ordered]@{
      contextSha256 = Get-Sha256Hex -Bytes $entropy
      derivation = 'SHA256_UTF8_DOMAIN_SEPARATED_V1'
    }
    envelopeType = 'PR12_WINDOWS_DPAPI_SECRET_ENVELOPE'
    machineNameSha256 = $MachineNameSha256
    notes = 'Synthetic local broker canary; no provider credential.'
    opaqueHandle = $OpaqueHandle
    opaqueHandleSha256 = $opaqueHandleSha256
    ownerSidSha256 = $OwnerSidSha256
    protectionScope = 'CURRENT_USER'
    providerId = $ProviderId
    role = $Role
    schemaVersion = 1
  }
  $envelopeFilename = '{0}.dpapi.json' -f $opaqueHandleSha256
  $envelopePath = [IO.Path]::Combine(
    $InputRecord.providerRoot,
    $envelopeFilename
  )
  $envelopeBytes = $Utf8Strict.GetBytes(
    (($envelope | ConvertTo-Json -Depth 10 -Compress) + "`n")
  )
  try {
    [IO.File]::WriteAllBytes($envelopePath, $envelopeBytes)
    Set-StrictAcl `
      -Value $envelopePath `
      -Directory $false `
      -CurrentSid $CurrentSid
    return [ordered]@{
      envelopeFilename = $envelopeFilename
      envelopeSha256 = Get-Sha256Hex -Bytes $envelopeBytes
      opaqueHandle = $OpaqueHandle
      opaqueHandleSha256 = $opaqueHandleSha256
      role = $Role
    }
  }
  finally {
    [Array]::Clear($envelopeBytes, 0, $envelopeBytes.Length)
  }
}

$inputText = [Console]::In.ReadToEnd()
$inputRecord = $inputText | ConvertFrom-Json -Depth 10 -DateKind String
$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$currentSid = $currentIdentity.User
$ownerSidSha256 = Get-TextSha256Hex -Value $currentSid.Value
$machineNameSha256 = Get-TextSha256Hex `
  -Value ([Environment]::MachineName.ToLowerInvariant())

try {
  foreach ($directory in @(
      $inputRecord.providerRoot,
      $inputRecord.journalDirectory,
      $inputRecord.evidenceParentDirectory
    )) {
    $null = [IO.Directory]::CreateDirectory($directory)
    Set-StrictAcl `
      -Value $directory `
      -Directory $true `
      -CurrentSid $currentSid
  }
  $management = Write-Envelope `
    -InputRecord $inputRecord `
    -Role 'MANAGEMENT_ACCESS_TOKEN' `
    -OpaqueHandle (
      'windows-dpapi-cu://pr12-source-project/management-access-token/v1'
    ) `
    -SyntheticValue 'synthetic-management-value' `
    -OwnerSidSha256 $ownerSidSha256 `
    -MachineNameSha256 $machineNameSha256 `
    -CurrentSid $currentSid
  $database = Write-Envelope `
    -InputRecord $inputRecord `
    -Role 'DATABASE_PASSWORD' `
    -OpaqueHandle (
      'windows-dpapi-cu://pr12-source-project/database-password/v1'
    ) `
    -SyntheticValue 'synthetic-database-password-value' `
    -OwnerSidSha256 $ownerSidSha256 `
    -MachineNameSha256 $machineNameSha256 `
    -CurrentSid $currentSid
  $claim = [ordered]@{
    actionId = $ActionId
    bindingMaterialSha256 = $inputRecord.bindingMaterialSha256
    claimedAt = [DateTimeOffset]::UtcNow.ToString(
      'yyyy-MM-ddTHH:mm:ss.fffZ',
      [Globalization.CultureInfo]::InvariantCulture
    )
    derivedExecutionBindingSha256 = (
      $inputRecord.derivedExecutionBindingSha256
    )
    payloadSha256 = $inputRecord.payloadSha256
    state = 'CLAIMED_POST_NOT_SENT'
  }
  $claimPath = [IO.Path]::Combine(
    $inputRecord.journalDirectory,
    'source-project-provisioning-action.claim.json'
  )
  $claimBytes = $Utf8Strict.GetBytes(
    (($claim | ConvertTo-Json -Depth 5 -Compress) + "`n")
  )
  try {
    [IO.File]::WriteAllBytes($claimPath, $claimBytes)
    Set-StrictAcl `
      -Value $claimPath `
      -Directory $false `
      -CurrentSid $currentSid
    $result = [ordered]@{
      claimSha256 = Get-Sha256Hex -Bytes $claimBytes
      database = $database
      management = $management
      powershellPath = [IO.Path]::Combine($PSHOME, 'pwsh.exe')
    }
    [Console]::Out.Write(($result | ConvertTo-Json -Depth 10 -Compress))
  }
  finally {
    [Array]::Clear($claimBytes, 0, $claimBytes.Length)
  }
}
finally {
  foreach ($buffer in $PlaintextBuffers) {
    [Array]::Clear($buffer, 0, $buffer.Length)
  }
  foreach ($buffer in $CiphertextBuffers) {
    [Array]::Clear($buffer, 0, $buffer.Length)
  }
  foreach ($buffer in $EntropyBuffers) {
    [Array]::Clear($buffer, 0, $buffer.Length)
  }
}
