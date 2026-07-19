[CmdletBinding()]
param(
  [ValidateRange(1, 10)]
  [int]$SampleCount = 5,

  [ValidateRange(250, 5000)]
  [int]$IntervalMilliseconds = 1000
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms

$powerPlanOutput = (powercfg.exe /getactivescheme | Out-String).Trim()
$powerPlanGuid = if (
  $powerPlanOutput -match
    '(?<guid>[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})'
) {
  $Matches.guid.ToLowerInvariant()
} else {
  $null
}

$samples = @()

for ($sampleNumber = 1; $sampleNumber -le $SampleCount; $sampleNumber++) {
  $processor = @(Get-CimInstance -ClassName Win32_Processor)
  $operatingSystem = Get-CimInstance -ClassName Win32_OperatingSystem
  $memory = Get-CimInstance -ClassName Win32_PerfFormattedData_PerfOS_Memory
  $processorInformation = @(
    Get-CimInstance -ClassName Win32_PerfFormattedData_Counters_ProcessorInformation |
      Where-Object { $_.Name -eq '_Total' }
  ) | Select-Object -First 1
  $wmiBattery = @(
    Get-CimInstance -Namespace root\wmi -ClassName BatteryStatus -ErrorAction SilentlyContinue
  )
  $powerStatus = [System.Windows.Forms.SystemInformation]::PowerStatus

  $cpuLoad = if ($processor.Count -gt 0) {
    [double](
      ($processor | Measure-Object -Property LoadPercentage -Average).Average
    )
  } else {
    $null
  }
  $currentClock = if ($processor.Count -gt 0) {
    [double](
      ($processor | Measure-Object -Property CurrentClockSpeed -Average).Average
    )
  } else {
    $null
  }
  $maximumClock = if ($processor.Count -gt 0) {
    [double](
      ($processor | Measure-Object -Property MaxClockSpeed -Maximum).Maximum
    )
  } else {
    $null
  }

  $totalMemoryBytes = [int64]$operatingSystem.TotalVisibleMemorySize * 1KB
  $availableMemoryBytes = [int64]$operatingSystem.FreePhysicalMemory * 1KB

  $samples += [ordered]@{
    sample = $sampleNumber
    capturedAtUtc = [DateTime]::UtcNow.ToString('o')
    powerLineStatus = $powerStatus.PowerLineStatus.ToString()
    powerOnline = (
      $powerStatus.PowerLineStatus -eq
        [System.Windows.Forms.PowerLineStatus]::Online
    )
    discharging = (
      $powerStatus.PowerLineStatus -eq
        [System.Windows.Forms.PowerLineStatus]::Offline
    )
    batteryChargeStatus = $powerStatus.BatteryChargeStatus.ToString()
    batteryLifePercent = if ($powerStatus.BatteryLifePercent -ge 0) {
      [math]::Round([double]$powerStatus.BatteryLifePercent * 100, 2)
    } else {
      $null
    }
    wmiBattery = @(
      $wmiBattery | ForEach-Object {
        [ordered]@{
          powerOnline = $_.PowerOnline
          discharging = $_.Discharging
          charging = $_.Charging
        }
      }
    )
    cpuLoadPercent = $cpuLoad
    cpuCurrentClockMhz = $currentClock
    cpuMaxClockMhz = $maximumClock
    processorUtilityPercent = if ($null -ne $processorInformation) {
      [double]$processorInformation.PercentProcessorUtility
    } else {
      $null
    }
    processorPerformancePercent = if ($null -ne $processorInformation) {
      [double]$processorInformation.PercentProcessorPerformance
    } else {
      $null
    }
    processorFrequencyMhz = if ($null -ne $processorInformation) {
      [double]$processorInformation.ProcessorFrequency
    } else {
      $null
    }
    processorPercentOfMaximumFrequency = if ($null -ne $processorInformation) {
      [double]$processorInformation.PercentofMaximumFrequency
    } else {
      $null
    }
    processorPrivilegedUtilityPercent = if ($null -ne $processorInformation) {
      [double]$processorInformation.PercentPrivilegedUtility
    } else {
      $null
    }
    processorDpcTimePercent = if ($null -ne $processorInformation) {
      [double]$processorInformation.PercentDPCTime
    } else {
      $null
    }
    processorInterruptTimePercent = if ($null -ne $processorInformation) {
      [double]$processorInformation.PercentInterruptTime
    } else {
      $null
    }
    totalMemoryBytes = $totalMemoryBytes
    availableMemoryBytes = $availableMemoryBytes
    availableMemoryFraction = if ($totalMemoryBytes -gt 0) {
      [math]::Round($availableMemoryBytes / $totalMemoryBytes, 6)
    } else {
      $null
    }
    committedBytesInUsePercent = if ($null -ne $memory) {
      [double]$memory.PercentCommittedBytesInUse
    } else {
      $null
    }
    pageFaultsPerSecond = if ($null -ne $memory) {
      [double]$memory.PageFaultsPersec
    } else {
      $null
    }
    pageReadsPerSecond = if ($null -ne $memory) {
      [double]$memory.PageReadsPersec
    } else {
      $null
    }
    pagesInputPerSecond = if ($null -ne $memory) {
      [double]$memory.PagesInputPersec
    } else {
      $null
    }
    pagesPerSecond = if ($null -ne $memory) {
      [double]$memory.PagesPersec
    } else {
      $null
    }
  }

  if ($sampleNumber -lt $SampleCount) {
    Start-Sleep -Milliseconds $IntervalMilliseconds
  }
}

[ordered]@{
  kind = 'pr11_phase_a2_host_telemetry'
  sampleCount = $SampleCount
  intervalMilliseconds = $IntervalMilliseconds
  powerPlanGuid = $powerPlanGuid
  samples = $samples
} | ConvertTo-Json -Depth 8 -Compress
