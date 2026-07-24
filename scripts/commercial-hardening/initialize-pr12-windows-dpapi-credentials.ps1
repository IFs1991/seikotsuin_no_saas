[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet('MANAGEMENT_ACCESS_TOKEN', 'DATABASE_PASSWORD')]
  [string]$Role,

  [Parameter(Mandatory)]
  [string]$AuthorizationEvidencePath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$ActionId = 'PR12-ACTION-003'
$BootstrapActionId = 'PR12-CREDENTIAL-BOOTSTRAP-001'
$ProviderId = 'WINDOWS_DPAPI_CURRENT_USER_V1'
$Utf8Strict = [System.Text.UTF8Encoding]::new($false, $true)
$PlaintextBytes = $null
$CiphertextBytes = $null
$EntropyBytes = $null
$SecureValue = $null
$Bstr = [IntPtr]::Zero
$CharacterBuffer = $null

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

function Assert-LowerSha256 {
  param([Parameter(Mandatory)][object]$Value)
  if ($Value -isnot [string] -or $Value -cnotmatch '^[a-f0-9]{64}$') {
    throw 'INVALID_SHA256'
  }
}

function Assert-ExactProperties {
  param(
    [Parameter(Mandatory)][object]$Value,
    [Parameter(Mandatory)][string[]]$Expected
  )
  $actual = @($Value.PSObject.Properties.Name | Sort-Object -CaseSensitive)
  $expectedSorted = @($Expected | Sort-Object -CaseSensitive)
  if ($actual.Count -ne $expectedSorted.Count) {
    throw 'INVALID_SHAPE'
  }
  for ($index = 0; $index -lt $expectedSorted.Count; $index += 1) {
    if ($actual[$index] -cne $expectedSorted[$index]) {
      throw 'INVALID_SHAPE'
    }
  }
}

function Get-NormalizedPath {
  param([Parameter(Mandatory)][string]$Value)
  if ($Value -notmatch '^[A-Za-z]:[\\/]') {
    throw 'INVALID_PATH'
  }
  return [IO.Path]::GetFullPath($Value).Replace('\', '/').ToLowerInvariant()
}

function Test-IsWithin {
  param(
    [Parameter(Mandatory)][string]$Parent,
    [Parameter(Mandatory)][string]$Candidate
  )
  $relative = [IO.Path]::GetRelativePath($Parent, $Candidate)
  return (
    $relative -eq '.' -or
    (-not $relative.StartsWith('..') -and
      -not [IO.Path]::IsPathRooted($relative))
  )
}

function Assert-NoReparsePoint {
  param([Parameter(Mandatory)][string]$Value)
  $attributes = [IO.File]::GetAttributes($Value)
  if (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'REPARSE_POINT_FORBIDDEN'
  }
}

function Assert-NoReparsePathComponents {
  param(
    [Parameter(Mandatory)][string]$Value,
    [Parameter(Mandatory)][bool]$AllowMissingComponents
  )
  $fullPath = [IO.Path]::GetFullPath($Value)
  $root = [IO.Path]::GetPathRoot($fullPath)
  $current = $root
  $missingSeen = $false
  foreach ($component in $fullPath.Substring($root.Length).Split(
      [IO.Path]::DirectorySeparatorChar,
      [StringSplitOptions]::RemoveEmptyEntries
    )) {
    $current = [IO.Path]::Combine($current, $component)
    if ([IO.Directory]::Exists($current)) {
      if ($missingSeen) {
        throw 'PATH_COMPONENT_IDENTITY_INVALID'
      }
      Assert-NoReparsePoint -Value $current
    }
    else {
      if (-not $AllowMissingComponents) {
        throw 'PATH_COMPONENT_MISSING'
      }
      $missingSeen = $true
    }
  }
}

function Get-ResolvedDirectoryPath {
  param(
    [Parameter(Mandatory)][string]$Value,
    [Parameter(Mandatory)][bool]$AllowMissingComponents
  )
  $fullPath = [IO.Path]::GetFullPath($Value)
  $root = [IO.Path]::GetPathRoot($fullPath)
  $resolved = $root
  foreach ($component in $fullPath.Substring($root.Length).Split(
      [IO.Path]::DirectorySeparatorChar,
      [StringSplitOptions]::RemoveEmptyEntries
    )) {
    $candidate = [IO.Path]::Combine($resolved, $component)
    if ([IO.Directory]::Exists($candidate)) {
      $info = [IO.DirectoryInfo]::new($candidate)
      if (($info.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        $target = $info.ResolveLinkTarget($true)
        if ($null -eq $target) {
          throw 'PATH_RESOLUTION_FAILED'
        }
        $resolved = $target.FullName
      }
      else {
        $resolved = $candidate
      }
    }
    else {
      if (-not $AllowMissingComponents) {
        throw 'PATH_COMPONENT_MISSING'
      }
      $resolved = $candidate
    }
  }
  return [IO.Path]::GetFullPath($resolved)
}

function Test-DirectoryTreesOverlap {
  param(
    [Parameter(Mandatory)][string]$Left,
    [Parameter(Mandatory)][string]$Right
  )
  return (
    (Test-IsWithin -Parent $Left -Candidate $Right) -or
    (Test-IsWithin -Parent $Right -Candidate $Left)
  )
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

function Assert-CanonicalUtcTimestamp {
  param([Parameter(Mandatory)][object]$Value)
  if ($Value -isnot [string]) {
    throw 'TIMESTAMP_INVALID'
  }
  $parsed = [DateTimeOffset]::MinValue
  if (
    -not [DateTimeOffset]::TryParse(
      $Value,
      [Globalization.CultureInfo]::InvariantCulture,
      [Globalization.DateTimeStyles]::RoundtripKind,
      [ref]$parsed
    ) -or
    $parsed.ToUniversalTime().ToString(
      'yyyy-MM-ddTHH:mm:ss.fffZ',
      [Globalization.CultureInfo]::InvariantCulture
    ) -cne $Value
  ) {
    throw 'TIMESTAMP_INVALID'
  }
  return $parsed
}

function Get-StableAuthorization {
  param([Parameter(Mandatory)][string]$Value)
  $resolved = [IO.Path]::GetFullPath($Value)
  Assert-NoReparsePoint -Value $resolved
  $before = [IO.FileInfo]::new($resolved)
  if (-not $before.Exists -or $before.Length -gt 65536) {
    throw 'AUTHORIZATION_EVIDENCE_INVALID'
  }
  $bytes = [IO.File]::ReadAllBytes($resolved)
  try {
    $after = [IO.FileInfo]::new($resolved)
    if (
      -not $after.Exists -or
      $before.Length -ne $after.Length -or
      $before.LastWriteTimeUtc -ne $after.LastWriteTimeUtc
    ) {
      throw 'AUTHORIZATION_EVIDENCE_CHANGED'
    }
    return ($Utf8Strict.GetString($bytes)) |
      ConvertFrom-Json -Depth 10 -DateKind String
  }
  finally {
    [Array]::Clear($bytes, 0, $bytes.Length)
  }
}

function Get-PlaintextBytesFromSecureString {
  param([Parameter(Mandatory)][Security.SecureString]$Value)
  $script:Bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  $characterCount = [Runtime.InteropServices.Marshal]::ReadInt32(
    [IntPtr]::Subtract($script:Bstr, 4)
  ) / 2
  if ($characterCount -lt 1 -or $characterCount -gt 4096) {
    throw 'SECRET_LENGTH_INVALID'
  }
  $script:CharacterBuffer = [char[]]::new($characterCount)
  for ($index = 0; $index -lt $characterCount; $index += 1) {
    $script:CharacterBuffer[$index] = [char][Runtime.InteropServices.Marshal]::ReadInt16(
      $script:Bstr,
      $index * 2
    )
  }
  return $Utf8Strict.GetBytes($script:CharacterBuffer)
}

if (
  $ExecutionContext.SessionState.LanguageMode -ne
    [Management.Automation.PSLanguageMode]::FullLanguage
) {
  throw 'FULL_LANGUAGE_REQUIRED'
}

try {
  $authorization = Get-StableAuthorization -Value $AuthorizationEvidencePath
  Assert-ExactProperties -Value $authorization -Expected @(
    'approvedAt',
    'approvedByDisplayName',
    'approvedByPrincipalId',
    'attestationStatus',
    'authorizedRoles',
    'bootstrapActionId',
    'bootstrapScriptSha256',
    'configurationId',
    'decision',
    'envelopeCreationAuthorized',
    'expiresAt',
    'machineNameSha256',
    'notes',
    'ownerSidSha256',
    'providerRoot',
    'providerRootPathSha256',
    'providerRootResolvedPathSha256',
    'realSecretInteractiveReadAuthorized',
    'recordType',
    'schemaVersion',
    'sourceProjectProvisioningAuthorized'
  )
  foreach ($field in @(
      'bootstrapScriptSha256',
      'machineNameSha256',
      'ownerSidSha256',
      'providerRootPathSha256',
      'providerRootResolvedPathSha256'
    )) {
    Assert-LowerSha256 -Value $authorization.$field
  }
  $approvedAt = Assert-CanonicalUtcTimestamp -Value $authorization.approvedAt
  $expiresAt = Assert-CanonicalUtcTimestamp -Value $authorization.expiresAt
  if (
    $authorization.schemaVersion -ne 1 -or
    $authorization.recordType -cne
      'PR12_WINDOWS_DPAPI_CREDENTIAL_BOOTSTRAP_APPROVAL' -or
    $authorization.decision -cne 'APPROVED' -or
    $authorization.attestationStatus -cne 'VERIFIED' -or
    $authorization.bootstrapActionId -cne $BootstrapActionId -or
    $authorization.realSecretInteractiveReadAuthorized -ne $true -or
    $authorization.envelopeCreationAuthorized -ne $true -or
    $authorization.sourceProjectProvisioningAuthorized -ne $false -or
    $authorization.approvedByDisplayName -cne 'FUTOSHI IWASAWA' -or
    $authorization.approvedByPrincipalId -isnot [string] -or
    $authorization.approvedByPrincipalId -cnotmatch
      '^[a-z0-9][a-z0-9._@+:-]*$' -or
    $authorization.approvedByPrincipalId -cne
      $authorization.approvedByPrincipalId.ToLowerInvariant() -or
    @(
      'not_captured',
      'not_implemented',
      'not_run',
      'pending',
      'unassigned',
      'unknown'
    ) -contains $authorization.approvedByPrincipalId -or
    $approvedAt -ge $expiresAt -or
    [DateTimeOffset]::UtcNow -lt $approvedAt -or
    [DateTimeOffset]::UtcNow -ge $expiresAt -or
    @($authorization.authorizedRoles) -notcontains $Role
  ) {
    throw 'BOOTSTRAP_NOT_AUTHORIZED'
  }

  $scriptBytes = [IO.File]::ReadAllBytes($PSCommandPath)
  try {
    if (
      (Get-Sha256Hex -Bytes $scriptBytes) -cne
        $authorization.bootstrapScriptSha256
    ) {
      throw 'BOOTSTRAP_SCRIPT_HASH_MISMATCH'
    }
  }
  finally {
    [Array]::Clear($scriptBytes, 0, $scriptBytes.Length)
  }
  $providerRoot = [IO.Path]::GetFullPath($authorization.providerRoot)
  $normalizedRoot = Get-NormalizedPath -Value $providerRoot
  Assert-NoReparsePathComponents `
    -Value $providerRoot `
    -AllowMissingComponents $true
  $resolvedProviderRoot = Get-ResolvedDirectoryPath `
    -Value $providerRoot `
    -AllowMissingComponents $true
  $normalizedResolvedRoot = Get-NormalizedPath -Value $resolvedProviderRoot
  if (
    (Get-TextSha256Hex -Value $normalizedRoot) -cne
      $authorization.providerRootPathSha256 -or
    (Get-TextSha256Hex -Value $normalizedResolvedRoot) -cne
      $authorization.providerRootResolvedPathSha256
  ) {
    throw 'PROVIDER_ROOT_MISMATCH'
  }
  $repositoryRoot = Get-ResolvedDirectoryPath -Value ([IO.Path]::GetFullPath(
    [IO.Path]::Combine($PSScriptRoot, '..', '..')
  )) -AllowMissingComponents $false
  $temporaryRoots = @(
    Get-ResolvedDirectoryPath `
      -Value ([IO.Path]::GetFullPath([IO.Path]::GetTempPath())) `
      -AllowMissingComponents $false
    $(if ($env:TEMP) {
        Get-ResolvedDirectoryPath `
          -Value ([IO.Path]::GetFullPath($env:TEMP)) `
          -AllowMissingComponents $false
      })
    $(if ($env:TMP) {
        Get-ResolvedDirectoryPath `
          -Value ([IO.Path]::GetFullPath($env:TMP)) `
          -AllowMissingComponents $false
      })
  ) | Where-Object { $null -ne $_ }
  if (
    (Test-DirectoryTreesOverlap `
      -Left $repositoryRoot `
      -Right $resolvedProviderRoot) -or
    @($temporaryRoots | Where-Object {
        Test-DirectoryTreesOverlap -Left $_ -Right $resolvedProviderRoot
      }).Count -gt 0
  ) {
    throw 'PROVIDER_ROOT_FORBIDDEN'
  }
  $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $currentSid = $currentIdentity.User
  $ownerSidSha256 = Get-TextSha256Hex -Value $currentSid.Value
  $machineNameSha256 = Get-TextSha256Hex `
    -Value ([Environment]::MachineName.ToLowerInvariant())
  if (
    $ownerSidSha256 -cne $authorization.ownerSidSha256 -or
    $machineNameSha256 -cne $authorization.machineNameSha256
  ) {
    throw 'OWNER_OR_MACHINE_MISMATCH'
  }
  if (-not [IO.Directory]::Exists($providerRoot)) {
    $null = [IO.Directory]::CreateDirectory($providerRoot)
  }
  Assert-NoReparsePathComponents `
    -Value $providerRoot `
    -AllowMissingComponents $false
  $resolvedProviderRootAfterCreation = Get-ResolvedDirectoryPath `
    -Value $providerRoot `
    -AllowMissingComponents $false
  if (
    (Get-TextSha256Hex -Value (
      Get-NormalizedPath -Value $resolvedProviderRootAfterCreation
    )) -cne $authorization.providerRootResolvedPathSha256
  ) {
    throw 'PROVIDER_ROOT_IDENTITY_CHANGED'
  }
  Set-StrictAcl -Value $providerRoot -Directory $true -CurrentSid $currentSid

  if ($Role -ceq 'MANAGEMENT_ACCESS_TOKEN') {
    $opaqueHandle =
      'windows-dpapi-cu://pr12-source-project/management-access-token/v1'
    $minimumBytes = 20
    $maximumBytes = 4096
  }
  else {
    $opaqueHandle =
      'windows-dpapi-cu://pr12-source-project/database-password/v1'
    $minimumBytes = 32
    $maximumBytes = 256
  }
  $opaqueHandleSha256 = Get-TextSha256Hex -Value $opaqueHandle
  $envelopeFilename = '{0}.dpapi.json' -f $opaqueHandleSha256
  $envelopePath = [IO.Path]::Combine($providerRoot, $envelopeFilename)
  if ([IO.File]::Exists($envelopePath)) {
    throw 'ENVELOPE_ALREADY_EXISTS'
  }

  $SecureValue = Read-Host `
    -Prompt ('Enter {0}; input is hidden' -f $Role) `
    -AsSecureString
  $PlaintextBytes = Get-PlaintextBytesFromSecureString -Value $SecureValue
  if (
    $PlaintextBytes.Length -lt $minimumBytes -or
    $PlaintextBytes.Length -gt $maximumBytes
  ) {
    throw 'SECRET_LENGTH_INVALID'
  }
  $null = $Utf8Strict.GetCharCount($PlaintextBytes)
  if (
    [Array]::IndexOf($PlaintextBytes, [byte]0) -ge 0 -or
    [Array]::IndexOf($PlaintextBytes, [byte]13) -ge 0 -or
    [Array]::IndexOf($PlaintextBytes, [byte]10) -ge 0
  ) {
    throw 'SECRET_CONTENT_INVALID'
  }
  $domain = (
    'PR12_DPAPI_ENTROPY_V1|{0}|{1}|{2}|{3}|{4}' -f
    $ActionId,
    $authorization.configurationId,
    $Role,
    $opaqueHandleSha256,
    $ownerSidSha256
  )
  $domainBytes = $Utf8Strict.GetBytes($domain)
  try {
    $EntropyBytes = [Security.Cryptography.SHA256]::HashData($domainBytes)
  }
  finally {
    [Array]::Clear($domainBytes, 0, $domainBytes.Length)
  }
  $CiphertextBytes = [Security.Cryptography.ProtectedData]::Protect(
    $PlaintextBytes,
    $EntropyBytes,
    [Security.Cryptography.DataProtectionScope]::CurrentUser
  )
  $createdAt = [DateTimeOffset]::UtcNow.ToString(
    'yyyy-MM-ddTHH:mm:ss.fffZ',
    [Globalization.CultureInfo]::InvariantCulture
  )
  $envelope = [ordered]@{
    actionId = $ActionId
    bootstrapScriptSha256 = $authorization.bootstrapScriptSha256
    ciphertextBase64 = [Convert]::ToBase64String($CiphertextBytes)
    ciphertextSha256 = Get-Sha256Hex -Bytes $CiphertextBytes
    configurationId = $authorization.configurationId
    createdAt = $createdAt
    encoding = 'UTF8_STRICT'
    entropy = [ordered]@{
      contextSha256 = Get-Sha256Hex -Bytes $EntropyBytes
      derivation = 'SHA256_UTF8_DOMAIN_SEPARATED_V1'
    }
    envelopeType = 'PR12_WINDOWS_DPAPI_SECRET_ENVELOPE'
    machineNameSha256 = $machineNameSha256
    notes = 'Owner-private external runtime envelope; never commit.'
    opaqueHandle = $opaqueHandle
    opaqueHandleSha256 = $opaqueHandleSha256
    ownerSidSha256 = $ownerSidSha256
    protectionScope = 'CURRENT_USER'
    providerId = $ProviderId
    role = $Role
    schemaVersion = 1
  }
  $envelopeBytes = $Utf8Strict.GetBytes(
    (($envelope | ConvertTo-Json -Depth 10 -Compress) + "`n")
  )
  try {
    $stream = [IO.FileStream]::new(
      $envelopePath,
      [IO.FileMode]::CreateNew,
      [IO.FileAccess]::Write,
      [IO.FileShare]::None,
      4096,
      [IO.FileOptions]::WriteThrough
    )
    try {
      $stream.Write($envelopeBytes, 0, $envelopeBytes.Length)
      $stream.Flush($true)
    }
    finally {
      $stream.Dispose()
    }
    Set-StrictAcl -Value $envelopePath -Directory $false -CurrentSid $currentSid
    Assert-NoReparsePoint -Value $envelopePath
    $readback = [IO.File]::ReadAllBytes($envelopePath)
    try {
      if (
        $readback.Length -ne $envelopeBytes.Length -or
        -not [Security.Cryptography.CryptographicOperations]::FixedTimeEquals(
          $readback,
          $envelopeBytes
        )
      ) {
        throw 'ENVELOPE_READBACK_MISMATCH'
      }
      $safeResult = [ordered]@{
        status = 'DPAPI_ENVELOPE_CREATED'
        role = $Role
        opaqueHandle = $opaqueHandle
        opaqueHandleSha256 = $opaqueHandleSha256
        envelopeFilename = $envelopeFilename
        envelopeSha256 = Get-Sha256Hex -Bytes $readback
        createdAt = $createdAt
        sourceProjectProvisioningPerformed = $false
      }
      [Console]::Out.Write(
        (($safeResult | ConvertTo-Json -Compress) + [Environment]::NewLine)
      )
    }
    finally {
      [Array]::Clear($readback, 0, $readback.Length)
    }
  }
  finally {
    [Array]::Clear($envelopeBytes, 0, $envelopeBytes.Length)
  }
}
finally {
  if ($null -ne $PlaintextBytes) {
    [Array]::Clear($PlaintextBytes, 0, $PlaintextBytes.Length)
  }
  if ($null -ne $CiphertextBytes) {
    [Array]::Clear($CiphertextBytes, 0, $CiphertextBytes.Length)
  }
  if ($null -ne $EntropyBytes) {
    [Array]::Clear($EntropyBytes, 0, $EntropyBytes.Length)
  }
  if ($null -ne $CharacterBuffer) {
    [Array]::Clear($CharacterBuffer, 0, $CharacterBuffer.Length)
  }
  if ($Bstr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Bstr)
  }
  if ($null -ne $SecureValue) {
    $SecureValue.Dispose()
  }
}
