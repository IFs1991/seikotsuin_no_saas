[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$ProvisioningActionId = 'PR12-ACTION-003'
$OrganizationIdentityCaptureActionId = 'PR12-ACTION-002'
$ProviderId = 'WINDOWS_DPAPI_CURRENT_USER_V1'
$RequestProtocol = 'PR12_DPAPI_BROKER_REQUEST_V1'
$ProvisioningClaimFileName = 'source-project-provisioning-action.claim.json'
$OrganizationIdentityCaptureClaimFileName =
  'source-organization-identity-capture-action.claim.json'
$MaximumRequestBytes = 16384
$MaximumResponseBytes = 8192
$Utf8Strict = [System.Text.UTF8Encoding]::new($false, $true)
$PlaintextBuffers = [System.Collections.Generic.List[byte[]]]::new()
$ResponseBuffer = $null
$RequestBytes = $null
$ExitCode = 70
$FailureStage = 'REQUEST'

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

function Assert-LowerSha256 {
  param([Parameter(Mandatory)][object]$Value)
  if ($Value -isnot [string] -or $Value -cnotmatch '^[a-f0-9]{64}$') {
    throw 'INVALID_SHA256'
  }
}

function Get-NormalizedPath {
  param([Parameter(Mandatory)][string]$Value)
  if ($Value -notmatch '^[A-Za-z]:[\\/]') {
    throw 'INVALID_PATH'
  }
  return [IO.Path]::GetFullPath($Value).Replace('\', '/').ToLowerInvariant()
}

function Assert-NoReparsePoint {
  param([Parameter(Mandatory)][string]$Value)
  $attributes = [IO.File]::GetAttributes($Value)
  if (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'REPARSE_POINT_FORBIDDEN'
  }
}

function Assert-NoReparsePathComponents {
  param([Parameter(Mandatory)][string]$Value)
  $fullPath = [IO.Path]::GetFullPath($Value)
  $root = [IO.Path]::GetPathRoot($fullPath)
  $current = $root
  foreach ($component in $fullPath.Substring($root.Length).Split(
      [IO.Path]::DirectorySeparatorChar,
      [StringSplitOptions]::RemoveEmptyEntries
    )) {
    $current = [IO.Path]::Combine($current, $component)
    if (-not [IO.Directory]::Exists($current)) {
      throw 'PATH_COMPONENT_MISSING'
    }
    Assert-NoReparsePoint -Value $current
  }
}

function Get-ResolvedDirectoryPath {
  param([Parameter(Mandatory)][string]$Value)
  $fullPath = [IO.Path]::GetFullPath($Value)
  $root = [IO.Path]::GetPathRoot($fullPath)
  $resolved = $root
  foreach ($component in $fullPath.Substring($root.Length).Split(
      [IO.Path]::DirectorySeparatorChar,
      [StringSplitOptions]::RemoveEmptyEntries
    )) {
    $candidate = [IO.Path]::Combine($resolved, $component)
    $info = [IO.DirectoryInfo]::new($candidate)
    if (-not $info.Exists) {
      throw 'PATH_COMPONENT_MISSING'
    }
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
  return [IO.Path]::GetFullPath($resolved)
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

function Assert-StrictAcl {
  param(
    [Parameter(Mandatory)][string]$Value,
    [Parameter(Mandatory)][bool]$Directory,
    [Parameter(Mandatory)][string]$CurrentSid
  )
  if ($Directory) {
    $info = [IO.DirectoryInfo]::new($Value)
  }
  else {
    $info = [IO.FileInfo]::new($Value)
  }
  $acl = [IO.FileSystemAclExtensions]::GetAccessControl(
    $info,
    [Security.AccessControl.AccessControlSections]::Access
  )
  if (-not $acl.AreAccessRulesProtected) {
    throw 'INHERITED_ACL_FORBIDDEN'
  }
  $rules = @(
    $acl.GetAccessRules(
      $true,
      $false,
      [Security.Principal.SecurityIdentifier]
    )
  )
  if ($rules.Count -lt 1) {
    throw 'ACL_MISSING'
  }
  foreach ($rule in $rules) {
    $sid = $rule.IdentityReference.Value
    if (
      ($sid -cne $CurrentSid -and $sid -cne 'S-1-5-18') -or
      $rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or
      $rule.IsInherited
    ) {
      throw 'ACL_TOO_BROAD'
    }
  }
}

function Read-BoundedStandardInput {
  $stream = [Console]::OpenStandardInput()
  $memory = [IO.MemoryStream]::new()
  $chunk = [byte[]]::new(1024)
  try {
    while ($true) {
      $read = $stream.Read($chunk, 0, $chunk.Length)
      if ($read -eq 0) {
        break
      }
      if (($memory.Length + $read) -gt $MaximumRequestBytes) {
        throw 'REQUEST_TOO_LARGE'
      }
      $memory.Write($chunk, 0, $read)
    }
    return $memory.ToArray()
  }
  finally {
    [Array]::Clear($chunk, 0, $chunk.Length)
    $memory.Dispose()
  }
}

function Read-StableFileBytes {
  param(
    [Parameter(Mandatory)][string]$Value,
    [Parameter(Mandatory)][int]$MaximumBytes
  )
  Assert-NoReparsePoint -Value $Value
  $before = [IO.FileInfo]::new($Value)
  if (-not $before.Exists -or $before.Length -gt $MaximumBytes) {
    throw 'FILE_INVALID'
  }
  $bytes = [IO.File]::ReadAllBytes($Value)
  $after = [IO.FileInfo]::new($Value)
  if (
    -not $after.Exists -or
    $before.Length -ne $after.Length -or
    $before.LastWriteTimeUtc -ne $after.LastWriteTimeUtc -or
    $bytes.Length -ne $after.Length
  ) {
    [Array]::Clear($bytes, 0, $bytes.Length)
    throw 'FILE_CHANGED'
  }
  return $bytes
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

function Get-Entropy {
  param(
    [Parameter(Mandatory)][string]$ConfigurationId,
    [Parameter(Mandatory)][string]$Role,
    [Parameter(Mandatory)][string]$OpaqueHandleSha256,
    [Parameter(Mandatory)][string]$OwnerSidSha256
  )
  $domain = (
    'PR12_DPAPI_ENTROPY_V1|{0}|{1}|{2}|{3}|{4}' -f
    $ProvisioningActionId,
    $ConfigurationId,
    $Role,
    $OpaqueHandleSha256,
    $OwnerSidSha256
  )
  $domainBytes = $Utf8Strict.GetBytes($domain)
  try {
    return [Security.Cryptography.SHA256]::HashData($domainBytes)
  }
  finally {
    [Array]::Clear($domainBytes, 0, $domainBytes.Length)
  }
}

function Unprotect-Envelope {
  param(
    [Parameter(Mandatory)][object]$Entry,
    [Parameter(Mandatory)][object]$Request,
    [Parameter(Mandatory)][string]$OwnerSid,
    [Parameter(Mandatory)][string]$OwnerSidSha256,
    [Parameter(Mandatory)][string]$MachineNameSha256
  )
  Assert-ExactProperties -Value $Entry -Expected @(
    'envelopeSha256',
    'opaqueHandle',
    'opaqueHandleSha256',
    'role'
  )
  Assert-LowerSha256 -Value $Entry.envelopeSha256
  Assert-LowerSha256 -Value $Entry.opaqueHandleSha256
  if (
    $Entry.opaqueHandle -isnot [string] -or
    (Get-TextSha256Hex -Value $Entry.opaqueHandle) -cne $Entry.opaqueHandleSha256 -or
    ($Entry.role -cne 'MANAGEMENT_ACCESS_TOKEN' -and
      $Entry.role -cne 'DATABASE_PASSWORD')
  ) {
    throw 'ENTRY_INVALID'
  }

  $envelopePath = [IO.Path]::Combine(
    $Request.providerRoot,
    ('{0}.dpapi.json' -f $Entry.opaqueHandleSha256)
  )
  Assert-NoReparsePoint -Value $envelopePath
  Assert-StrictAcl -Value $envelopePath -Directory $false -CurrentSid $OwnerSid
  $envelopeBytes = Read-StableFileBytes -Value $envelopePath -MaximumBytes 1048576
  try {
    if ((Get-Sha256Hex -Bytes $envelopeBytes) -cne $Entry.envelopeSha256) {
      throw 'ENVELOPE_HASH_MISMATCH'
    }
    $envelopeText = $Utf8Strict.GetString($envelopeBytes)
    $envelope = $envelopeText |
      ConvertFrom-Json -Depth 20 -DateKind String
    Assert-ExactProperties -Value $envelope -Expected @(
      'actionId',
      'bootstrapScriptSha256',
      'ciphertextBase64',
      'ciphertextSha256',
      'configurationId',
      'createdAt',
      'encoding',
      'entropy',
      'envelopeType',
      'machineNameSha256',
      'notes',
      'opaqueHandle',
      'opaqueHandleSha256',
      'ownerSidSha256',
      'protectionScope',
      'providerId',
      'role',
      'schemaVersion'
    )
    Assert-ExactProperties -Value $envelope.entropy -Expected @(
      'contextSha256',
      'derivation'
    )
    Assert-LowerSha256 -Value $envelope.bootstrapScriptSha256
    Assert-LowerSha256 -Value $envelope.ciphertextSha256
    Assert-LowerSha256 -Value $envelope.entropy.contextSha256
    if (
      $envelope.schemaVersion -ne 1 -or
      $envelope.envelopeType -cne 'PR12_WINDOWS_DPAPI_SECRET_ENVELOPE' -or
      $envelope.providerId -cne $ProviderId -or
      $envelope.configurationId -cne $Request.configurationId -or
      $envelope.actionId -cne $ProvisioningActionId -or
      $envelope.role -cne $Entry.role -or
      $envelope.opaqueHandle -cne $Entry.opaqueHandle -or
      $envelope.opaqueHandleSha256 -cne $Entry.opaqueHandleSha256 -or
      $envelope.ownerSidSha256 -cne $OwnerSidSha256 -or
      $envelope.machineNameSha256 -cne $MachineNameSha256 -or
      $envelope.bootstrapScriptSha256 -cne
        $Request.bootstrapScriptSha256 -or
      $envelope.protectionScope -cne 'CURRENT_USER' -or
      $envelope.encoding -cne 'UTF8_STRICT' -or
      $envelope.entropy.derivation -cne 'SHA256_UTF8_DOMAIN_SEPARATED_V1'
    ) {
      throw 'ENVELOPE_BINDING_INVALID'
    }
    $null = Assert-CanonicalUtcTimestamp -Value $envelope.createdAt
    $ciphertext = [Convert]::FromBase64String($envelope.ciphertextBase64)
    try {
      if ((Get-Sha256Hex -Bytes $ciphertext) -cne $envelope.ciphertextSha256) {
        throw 'CIPHERTEXT_HASH_MISMATCH'
      }
      $entropy = Get-Entropy `
        -ConfigurationId $Request.configurationId `
        -Role $Entry.role `
        -OpaqueHandleSha256 $Entry.opaqueHandleSha256 `
        -OwnerSidSha256 $OwnerSidSha256
      try {
        if ((Get-Sha256Hex -Bytes $entropy) -cne $envelope.entropy.contextSha256) {
          throw 'ENTROPY_BINDING_INVALID'
        }
        $script:FailureStage = if ($Entry.role -ceq 'MANAGEMENT_ACCESS_TOKEN') {
          'MANAGEMENT_ACCESS_TOKEN_DPAPI'
        }
        else {
          'DATABASE_PASSWORD_DPAPI'
        }
        $plaintext = [Security.Cryptography.ProtectedData]::Unprotect(
          $ciphertext,
          $entropy,
          [Security.Cryptography.DataProtectionScope]::CurrentUser
        )
        $PlaintextBuffers.Add($plaintext)
        $value = $Utf8Strict.GetString($plaintext)
        if (
          $value.Contains([char]0) -or
          $value.Contains("`r") -or
          $value.Contains("`n") -or
          $Utf8Strict.GetByteCount($value) -ne $plaintext.Length
        ) {
          throw 'PLAINTEXT_INVALID'
        }
        return $plaintext
      }
      finally {
        if ($null -ne $entropy) {
          [Array]::Clear($entropy, 0, $entropy.Length)
        }
      }
    }
    finally {
      if ($null -ne $ciphertext) {
        [Array]::Clear($ciphertext, 0, $ciphertext.Length)
      }
    }
  }
  finally {
    [Array]::Clear($envelopeBytes, 0, $envelopeBytes.Length)
  }
}

function Set-UInt32BigEndian {
  param(
    [Parameter(Mandatory)][byte[]]$Target,
    [Parameter(Mandatory)][int]$Offset,
    [Parameter(Mandatory)][uint32]$Value
  )
  $Target[$Offset] = [byte](($Value -shr 24) -band 0xff)
  $Target[$Offset + 1] = [byte](($Value -shr 16) -band 0xff)
  $Target[$Offset + 2] = [byte](($Value -shr 8) -band 0xff)
  $Target[$Offset + 3] = [byte]($Value -band 0xff)
}

try {
  if (
    $ExecutionContext.SessionState.LanguageMode -ne
      [Management.Automation.PSLanguageMode]::FullLanguage
  ) {
    throw 'LANGUAGE_MODE_INVALID'
  }
  $RequestBytes = Read-BoundedStandardInput
  if (
    $RequestBytes.Length -lt 2 -or
    $RequestBytes[$RequestBytes.Length - 1] -ne 10 -or
    [Array]::IndexOf($RequestBytes, [byte]13) -ge 0
  ) {
    throw 'REQUEST_FRAMING_INVALID'
  }
  $requestText = $Utf8Strict.GetString(
    $RequestBytes,
    0,
    $RequestBytes.Length - 1
  )
  $request = $requestText | ConvertFrom-Json -Depth 20 -DateKind String
  $isIdentityCapture = (
    $request.PSObject.Properties.Name -ccontains 'mode' -and
    $request.mode -ceq 'ORGANIZATION_IDENTITY_CAPTURE'
  )
  $requestProperties = @(
    'actionId',
    'approvalExpiresAt',
    'bindingMaterialSha256',
    'bootstrapScriptSha256',
    'claimSha256',
    'credentialConfigurationSha256',
    'configurationId',
    'entries',
    'evidenceParentDirectory',
    'evidenceParentDirectoryPathSha256',
    'journalDirectory',
    'journalDirectoryPathSha256',
    'mode',
    'payloadSha256',
    'protocol',
    'providerId',
    'providerRoot',
    'providerRootPathSha256',
    'providerRootResolvedPathSha256',
    'requestNonce',
    'schemaVersion'
  )
  if (-not $isIdentityCapture) {
    $requestProperties += 'derivedExecutionBindingSha256'
  }
  Assert-ExactProperties -Value $request -Expected $requestProperties
  $sha256Properties = @(
      'bindingMaterialSha256',
      'bootstrapScriptSha256',
      'claimSha256',
      'credentialConfigurationSha256',
      'evidenceParentDirectoryPathSha256',
      'journalDirectoryPathSha256',
      'payloadSha256',
      'providerRootPathSha256',
      'providerRootResolvedPathSha256',
      'requestNonce'
  )
  if (-not $isIdentityCapture) {
    $sha256Properties += 'derivedExecutionBindingSha256'
  }
  foreach ($property in $sha256Properties) {
    Assert-LowerSha256 -Value $request.$property
  }
  $expectedActionId = if ($isIdentityCapture) {
    $OrganizationIdentityCaptureActionId
  }
  else {
    $ProvisioningActionId
  }
  if (
    $request.schemaVersion -ne 1 -or
    $request.protocol -cne $RequestProtocol -or
    $request.actionId -cne $expectedActionId -or
    $request.providerId -cne $ProviderId -or
    ($request.mode -cne 'EXECUTE' -and
      $request.mode -cne 'RECOVERY' -and
      $request.mode -cne 'ORGANIZATION_IDENTITY_CAPTURE') -or
    $request.configurationId -isnot [string] -or
    [string]::IsNullOrWhiteSpace($request.configurationId)
  ) {
    throw 'REQUEST_INVALID'
  }
  $entries = @($request.entries)
  $expectedCount = if ($request.mode -ceq 'EXECUTE') { 2 } else { 1 }
  if ($entries.Count -ne $expectedCount) {
    throw 'ENTRY_COUNT_INVALID'
  }
  if (
    $entries[0].role -cne 'MANAGEMENT_ACCESS_TOKEN' -or
    ($request.mode -ceq 'EXECUTE' -and
      $entries[1].role -cne 'DATABASE_PASSWORD')
  ) {
    throw 'ENTRY_ORDER_INVALID'
  }
  $expiresAt = Assert-CanonicalUtcTimestamp -Value $request.approvalExpiresAt
  if ($expiresAt -le [DateTimeOffset]::UtcNow) {
    throw 'REQUEST_EXPIRED'
  }
  $FailureStage = 'BOUNDARY'
  Assert-NoReparsePathComponents -Value $request.providerRoot
  $resolvedProviderRoot = Get-ResolvedDirectoryPath -Value $request.providerRoot
  $normalizedProviderRoot = Get-NormalizedPath -Value $request.providerRoot
  $normalizedResolvedProviderRoot = Get-NormalizedPath `
    -Value $resolvedProviderRoot
  if (
    (Get-TextSha256Hex -Value $normalizedProviderRoot) -cne
      $request.providerRootPathSha256 -or
    (Get-TextSha256Hex -Value $normalizedResolvedProviderRoot) -cne
      $request.providerRootResolvedPathSha256
  ) {
    throw 'PROVIDER_ROOT_MISMATCH'
  }
  Assert-NoReparsePathComponents -Value $request.journalDirectory
  $resolvedJournal = Get-ResolvedDirectoryPath -Value $request.journalDirectory
  $normalizedJournal = Get-NormalizedPath -Value $request.journalDirectory
  if (
    (Get-TextSha256Hex -Value $normalizedJournal) -cne
      $request.journalDirectoryPathSha256
  ) {
    throw 'JOURNAL_PATH_MISMATCH'
  }
  Assert-NoReparsePathComponents -Value $request.evidenceParentDirectory
  $resolvedEvidenceParent = Get-ResolvedDirectoryPath `
    -Value $request.evidenceParentDirectory
  $normalizedEvidenceParent = Get-NormalizedPath `
    -Value $request.evidenceParentDirectory
  if (
    (Get-TextSha256Hex -Value $normalizedEvidenceParent) -cne
      $request.evidenceParentDirectoryPathSha256
  ) {
    throw 'EVIDENCE_PATH_MISMATCH'
  }
  if (
    (Test-DirectoryTreesOverlap `
      -Left $resolvedProviderRoot `
      -Right $resolvedJournal) -or
    (Test-DirectoryTreesOverlap `
      -Left $resolvedProviderRoot `
      -Right $resolvedEvidenceParent) -or
    (Test-DirectoryTreesOverlap `
      -Left $resolvedJournal `
      -Right $resolvedEvidenceParent)
  ) {
    throw 'DIRECTORY_BOUNDARY_COLLISION'
  }
  $ownerSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $ownerSidSha256 = Get-TextSha256Hex -Value $ownerSid
  $machineNameSha256 = Get-TextSha256Hex `
    -Value ([Environment]::MachineName.ToLowerInvariant())
  Assert-StrictAcl `
    -Value $request.providerRoot `
    -Directory $true `
    -CurrentSid $ownerSid
  Assert-StrictAcl `
    -Value $request.journalDirectory `
    -Directory $true `
    -CurrentSid $ownerSid
  Assert-StrictAcl `
    -Value $request.evidenceParentDirectory `
    -Directory $true `
    -CurrentSid $ownerSid

  $claimFileName = if ($isIdentityCapture) {
    $OrganizationIdentityCaptureClaimFileName
  }
  else {
    $ProvisioningClaimFileName
  }
  $claimPath = [IO.Path]::Combine(
    $request.journalDirectory,
    $claimFileName
  )
  Assert-NoReparsePoint -Value $claimPath
  $claimBytes = Read-StableFileBytes -Value $claimPath -MaximumBytes 65536
  try {
    if ((Get-Sha256Hex -Bytes $claimBytes) -cne $request.claimSha256) {
      throw 'CLAIM_HASH_MISMATCH'
    }
    $claim = ($Utf8Strict.GetString($claimBytes)) |
      ConvertFrom-Json -Depth 10 -DateKind String
    $claimProperties = @(
      'actionId',
      'bindingMaterialSha256',
      'claimedAt',
      'payloadSha256',
      'state'
    )
    if (-not $isIdentityCapture) {
      $claimProperties += 'derivedExecutionBindingSha256'
    }
    Assert-ExactProperties -Value $claim -Expected $claimProperties
    $expectedClaimState = if ($isIdentityCapture) {
      'CLAIMED_GET_NOT_SENT'
    }
    else {
      'CLAIMED_POST_NOT_SENT'
    }
    if (
      $claim.actionId -cne $expectedActionId -or
      $claim.bindingMaterialSha256 -cne $request.bindingMaterialSha256 -or
      $claim.payloadSha256 -cne $request.payloadSha256 -or
      (-not $isIdentityCapture -and
        $claim.derivedExecutionBindingSha256 -cne
          $request.derivedExecutionBindingSha256) -or
      $claim.state -cne $expectedClaimState
    ) {
      throw 'CLAIM_BINDING_MISMATCH'
    }
    $null = Assert-CanonicalUtcTimestamp -Value $claim.claimedAt
  }
  finally {
    [Array]::Clear($claimBytes, 0, $claimBytes.Length)
  }

  $values = [System.Collections.Generic.List[byte[]]]::new()
  foreach ($entry in $entries) {
    $FailureStage = if ($entry.role -ceq 'MANAGEMENT_ACCESS_TOKEN') {
      'MANAGEMENT_ACCESS_TOKEN'
    }
    else {
      'DATABASE_PASSWORD'
    }
    $values.Add(
      (Unprotect-Envelope `
          -Entry $entry `
          -Request $request `
          -OwnerSid $ownerSid `
          -OwnerSidSha256 $ownerSidSha256 `
          -MachineNameSha256 $machineNameSha256)
    )
  }
  $FailureStage = 'CREDENTIAL_LENGTH'
  if (
    $values[0].Length -lt 20 -or
    $values[0].Length -gt 4096 -or
    ($request.mode -ceq 'EXECUTE' -and
      ($values[1].Length -lt 32 -or $values[1].Length -gt 256))
  ) {
    throw 'CREDENTIAL_LENGTH_INVALID'
  }

  $FailureStage = 'RESPONSE'
  $responseLength = 44
  foreach ($value in $values) {
    $responseLength += 5 + $value.Length
  }
  if ($responseLength -gt $MaximumResponseBytes) {
    throw 'RESPONSE_TOO_LARGE'
  }
  $ResponseBuffer = [byte[]]::new($responseLength)
  [Text.Encoding]::ASCII.GetBytes('PR12DPB1').CopyTo($ResponseBuffer, 0)
  $ResponseBuffer[8] = 1
  $ResponseBuffer[9] = if ($request.mode -ceq 'EXECUTE') {
    1
  }
  elseif ($request.mode -ceq 'RECOVERY') {
    2
  }
  else {
    3
  }
  $ResponseBuffer[10] = [byte]$values.Count
  $ResponseBuffer[11] = 0
  $requestSha = [Security.Cryptography.SHA256]::HashData($RequestBytes)
  try {
    $requestSha.CopyTo($ResponseBuffer, 12)
  }
  finally {
    [Array]::Clear($requestSha, 0, $requestSha.Length)
  }
  $offset = 44
  for ($index = 0; $index -lt $values.Count; $index += 1) {
    $ResponseBuffer[$offset] = if ($index -eq 0) { 1 } else { 2 }
    Set-UInt32BigEndian `
      -Target $ResponseBuffer `
      -Offset ($offset + 1) `
      -Value $values[$index].Length
    $offset += 5
    $values[$index].CopyTo($ResponseBuffer, $offset)
    $offset += $values[$index].Length
  }
  $output = [Console]::OpenStandardOutput()
  $output.Write($ResponseBuffer, 0, $ResponseBuffer.Length)
  $output.Flush()
  $ExitCode = 0
}
catch {
  $ExitCode = switch ($FailureStage) {
    'REQUEST' { 71 }
    'BOUNDARY' { 72 }
    'MANAGEMENT_ACCESS_TOKEN' { 73 }
    'DATABASE_PASSWORD' { 74 }
    'RESPONSE' { 75 }
    'MANAGEMENT_ACCESS_TOKEN_DPAPI' { 76 }
    'DATABASE_PASSWORD_DPAPI' { 77 }
    'CREDENTIAL_LENGTH' { 78 }
    default { 70 }
  }
}
finally {
  foreach ($buffer in $PlaintextBuffers) {
    [Array]::Clear($buffer, 0, $buffer.Length)
  }
  if ($null -ne $ResponseBuffer) {
    [Array]::Clear($ResponseBuffer, 0, $ResponseBuffer.Length)
  }
  if ($null -ne $RequestBytes) {
    [Array]::Clear($RequestBytes, 0, $RequestBytes.Length)
  }
}

exit $ExitCode
