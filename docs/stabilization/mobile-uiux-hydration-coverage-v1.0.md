# Mobile UIUX Hydration Coverage v1.0

Source: `docs/stabilization/spec-mobile-uiux-mock-to-production-api-v1.0.md` §4 (GAP-2)

This inventory covers every key returned from `renderVals()` for the six production Mobile UIUX screens. Grouped rows mean every key listed in that row shares the same classification and decision.

Classifications:

- `hydrated`: the production bridge/adapters replace the value from Mobile UIUX BFF payloads or derived BFF view models.
- `static`: fixed UI text, icons, handlers, styling, local UI state, or derived visibility with no business sample data.
- `sample`: originally derived from DC script sample arrays/state. Each row records `(a) hydrate`, `(b) hide/remove/fail-closed`, or `(c) leave with sample labeling/deferred handling`.

Write-open screens are `reservations`, `daily-reports`, and `settings-detail`. They have no `(c)` sample decisions.

## home

| Classification | Decision | Key(s) | Notes |
| --- | --- | --- | --- |
| hydrated | n/a | `dateLabel`, `kpiTitle`, `kpiSub`, `kpis`, `showAttention`, `attTitle`, `attCount`, `attentions`, `agTotal`, `agUnc`, `agCancel`, `drDone`, `drReview`, `drMissing`, `reportRows` | From `/api/mobile-uiux/home`. |
| sample | (c) sample label/defer | `greeting`, `scopeTag`, `scopeName`, `scopeSheetTitle`, `scopeOpts`, `agendaRows`, `agPastCount`, `pastLabel`, `pastChevron`, `aiSummary`, `aiPoints`, `revBars`, `revDelta`, `heatCells`, `quickActions`, `clinicCards`, `events`, `showShortcuts`, `shortcutsTitle`, `shortcuts`, `signals`, `perfRows`, `detailOpen`, `dPatient`, `dMenu`, `dInitial`, `dTime`, `dDur`, `dTher`, `dTherRole`, `dStatusLabel`, `dC`, `dB` | Read-only surface. Keep as managed residual sample until home read model expands. |
| static | n/a | `setRoot`, `roleVal`, `onRole`, `setLight`, `setDark`, `lightBtn`, `darkBtn`, `nowClock`, `openScope`, `closeScope`, `scopeSheetOpen`, `isLoading`, `showBody`, `isStore`, `isManager`, `isAdmin`, `togglePast`, `goReservations`, `goCompare`, `closeDetail`, `toastShow`, `toastMsg` | UI controls, styling, role mode, loading/toast state. |

## reservations

| Classification | Decision | Key(s) | Notes |
| --- | --- | --- | --- |
| hydrated | n/a | `dateLabel`, `sumTotal`, `sumConf`, `sumUnc`, `sumCancel`, `isLoading`, `isEmpty`, `showAgenda`, `showTimeline`, `rows`, `tlBlocks`, `tlFree`, `therChips`, `detailOpen`, `dPatient`, `dMenu`, `dTime`, `dDur`, `dTher`, `dTherRole`, `dInitial`, `dStatusLabel`, `dC`, `dB`, `dShowConfirm`, `dShowCancel`, `arrivalOpts`, `moveSlots`, `assignOpts` | Reservation rows/detail/timeline are rebuilt from `/api/mobile-uiux/reservations`; staff/resource labels use supplemental `/api/mobile-uiux/settings-detail`. |
| sample | (a) hydrate | `clinicName`, `clinicOpts`, `readonlyMsg`, `fMenu`, `fEnd`, `fDurLabel`, `fRes`, `menuOpts`, `resOpts` | Clinic label is hydrated from settings-detail `clinic` when available and otherwise empty. Menu/resource form values are hydrated from settings-detail `menus` / `resources`; sample arrays are cleared first. |
| sample | (b) hide/fail-closed | `historyItems`, `histCount` | Sample generated reservation history is disabled in production; history sheet can open but returns no synthetic past rows. |
| static | n/a | `setRoot`, `roleVal`, `onRole`, `setLight`, `setDark`, `lightBtn`, `darkBtn`, `nowClock`, `prevDate`, `nextDate`, `moreMenu`, `agStyle`, `tlStyle`, `viewAgenda`, `viewTimeline`, `showSelf`, `toggleSelf`, `selfStyle`, `selfDot`, `isReadOnly`, `canWrite`, `crossClinic`, `openClinic`, `closeClinic`, `clinicSheetOpen`, `emptyTitle`, `emptyBody`, `tlHeight`, `tlHours`, `tlNowShow`, `tlNowTop`, `tlNowLabel`, `fabShow`, `newAppt`, `closeDetail`, `detailTransform`, `detailTransition`, `openHistory`, `closeHistory`, `historyOpen`, `dReadonly`, `openTime`, `openAssignee`, `confirmAppt`, `cancelAppt`, `subOpen`, `closeSub`, `timeSheetOpen`, `assigneeSheetOpen`, `subTitle`, `moveError`, `moveErrShow`, `formOpen`, `closeForm`, `formTransform`, `formTransition`, `fPatient`, `onPatient`, `fNote`, `onNote`, `onMenu`, `fStart`, `onStart`, `startOpts`, `onRes`, `fNominated`, `toggleNominated`, `nomBoxStyle`, `submitForm`, `toastShow`, `toastMsg` | UI state, controls, styles, time grid constants, and write handlers. |

## patients

| Classification | Decision | Key(s) | Notes |
| --- | --- | --- | --- |
| hydrated | n/a | `scopeLabel`, `scSummary`, `funnel`, `trendBars`, `segments`, `riskList`, `followList`, `ltvList`, `riskHighCount`, `kpiBoxes`, `chartBars`, `clinicCards`, `detailOpen`, `dName`, `dKpi`, `dRisk`, `dFollow` | From `/api/mobile-uiux/patient-analysis` `analysis` plus minimal `rows`; production adapter replaces sample patient names, KPI values, risk/follow/LTV lists, clinic cards, and detail sheet values. |
| sample | (a) hydrate/fail-closed | `clinicSelOpts`, `pClinic` | Sample clinic options are replaced by the BFF-scoped clinic label; invalid pre-hydration sample clinic selections are reset to `all`. |
| static | n/a | `setRoot`, `roleVal`, `onRole`, `setLight`, `setDark`, `lightBtn`, `darkBtn`, `showSingle`, `showManager`, `onClinicSel`, `selMonth`, `sel30`, `selCustom`, `mMonthStyle`, `m30Style`, `mCustomStyle`, `showCustom`, `pStart`, `pEnd`, `onStart`, `onEnd`, `filterErr`, `filterErrShow`, `applyFilter`, `resetFilter`, `dirty`, `periodLabel`, `closeDetail`, `toastShow`, `toastMsg` | UI controls, filter state, visibility, period labels, and toast state. |

## daily-reports

| Classification | Decision | Key(s) | Notes |
| --- | --- | --- | --- |
| hydrated | n/a | `todayLabel`, `todayUnsubmitted`, `todaySubmittedFlag`, `todayCount`, `sumRevenue`, `sumPatients`, `sumHoken`, `sumJihi`, `listRows`, `kpiBoxes`, `trendCards`, `statusRows` | From `/api/mobile-uiux/daily-reports`. |
| sample | (a) hydrate | `formDate`, `formTher`, `therOpts`, `itemRows`, `menuOpts`, `totalCount`, `totalYen`, `inputToday` | Form date uses the hydrated `todayLabel`; sample line items are cleared. Therapist/menu options use supplemental settings-detail `resources` / `menus`. |
| static | n/a | `setRoot`, `roleVal`, `onRole`, `setLight`, `setDark`, `lightBtn`, `darkBtn`, `showStandard`, `showManager`, `isReadOnly`, `canWrite`, `pToday`, `p7`, `pMonth`, `pTodayStyle`, `p7Style`, `pMonthStyle`, `periodLabel`, `formOpen`, `closeForm`, `onFormTher`, `ratioOpts`, `addItem`, `saveReport`, `toastShow`, `toastMsg` | UI controls, period selector state, write handler, ratio constants, and toast state. |

## settings

| Classification | Decision | Key(s) | Notes |
| --- | --- | --- | --- |
| hydrated | n/a | none | `/api/mobile-uiux/settings` is wired for settings category calls, but this top-level settings mock still renders local/sample rows. |
| sample | (c) sample label/defer | `headerTitle`, `headerSub`, `showSub`, `groups`, `acctInitial`, `acctName`, `acctRoleLabel`, `acctClinic`, `acctEmail`, `acctRows`, `detailRows`, `subsetBanner`, `subsetText`, `shiftModeLabel`, `shiftClinic`, `shiftPeriod`, `selfCards`, `subCards`, `attCards`, `attSheetTitle`, `attSubmitLabel`, `attType`, `attDate`, `attIn`, `attOut`, `attBrk`, `attHelp`, `attHelpClinic`, `attHelpHours`, `attNote`, `formType`, `formDate`, `formStart`, `formEnd`, `priBtns`, `formNote` | Not one of the write-open production screens in §4.3. Remains documented residual sample until settings top-level contracts are expanded. |
| static | n/a | `setRoot`, `roleVal`, `onRole`, `roleLabel`, `setLight`, `setDark`, `lightBtn`, `darkBtn`, `showBack`, `onBack`, `backChev`, `titlePad`, `isTop`, `isAccount`, `isDetail`, `isShift`, `isAttendance`, `searchVal`, `onSearch`, `searchIcon`, `chevR`, `isSelf`, `isManage`, `showSubmitBar`, `showAttBar`, `showNav`, `attSheetOpen`, `openAttSheet`, `closeAttSheet`, `onAttType`, `attTypeOpts`, `onAttDate`, `onAttIn`, `onAttOut`, `onAttBrk`, `attBrkOpts`, `toggleAttHelp`, `attHelpTrack`, `attHelpKnob`, `onAttHelpClinic`, `attHelpClinicOpts`, `onAttHelpHours`, `attHelpHoursOpts`, `onAttNote`, `submitAtt`, `sheetOpen`, `openSheet`, `closeSheet`, `onFormType`, `typeOpts`, `onFormDate`, `showTimeRow`, `onFormStart`, `onFormEnd`, `onFormNote`, `submitShift`, `toastShow`, `toastMsg` | UI controls, navigation state, style helpers, and handlers. |

## settings-detail

| Classification | Decision | Key(s) | Notes |
| --- | --- | --- | --- |
| hydrated | n/a | `clinicName`, `clinicInitial`, `basicFields`, `introVal`, `dayCards`, `menuCount`, `menuCards`, `showSaveBar`, `saveLabel`, `onSave`, `clinicOpts` | Clinic basics and menu cards use `/api/mobile-uiux/settings-detail`; clinic hours use supplemental `/api/mobile-uiux/settings?category=clinic_hours`. Save bar is restricted to clinic hours, the supported write category. |
| sample | (a) hydrate/fail-closed | `specialCards`, `hasSpecial`, `noSpecial`, `insCards`, `medCode`, `receiptFooter`, `receiptToggles`, `closingDay`, `payChips`, `autoTrack`, `reminderDays`, `mfName`, `mfCat`, `mfDur`, `mfPrice`, `mfActiveTrack` | Production adapter clears unsupported/sample defaults to empty, false, or blank values unless a supported BFF payload supplies data. |
| sample | (b) hide/remove | `tplOpen`, `tplSub`, `isOwnerClinic`, `isManagerScope`, `createTpl`, `templates`, `tplIcon`, `tplChevron` | Menu template block is removed from the production DOM by the production transform; original `.dc.html` is unchanged. |
| static | n/a | `setRoot`, `roleVal`, `onRole`, `roleLabel`, `setLight`, `setDark`, `lightBtn`, `darkBtn`, `isAdmin`, `isManager`, `showBack`, `onBack`, `backChev`, `titlePad`, `headerTitle`, `headerSub`, `showSub`, `showContext`, `openClinic`, `isIndex`, `indexRows`, `chevR`, `isClinic`, `isServices`, `isInsurance`, `tabBasic`, `tabHours`, `basicTabStyle`, `hoursTabStyle`, `isBasic`, `isHours`, `onIntro`, `pickLogo`, `removeLogo`, `trashEl`, `addSpecial`, `specialTypeOpts`, `onMedCode`, `onReceiptFooter`, `closingOpts`, `autoKnob`, `onAutoReconcile`, `onReminderDays`, `openAddMenu`, `toggleTpl`, `pencilEl`, `cancelDelete`, `saving`, `onCancel`, `showNav`, `menuSheetOpen`, `closeMenuSheet`, `menuSheetTitle`, `menuSaveLabel`, `onMfName`, `onMfCat`, `catOpts`, `kindInsStyle`, `kindSelfStyle`, `setKindIns`, `setKindSelf`, `onMfDur`, `onMfPrice`, `mfActiveKnob`, `toggleMfActive`, `saveMenu`, `clinicSheetOpen`, `closeClinic`, `toastShow`, `toastMsg` | UI state, controls, icon/style helpers, and handlers. |

## PR-2 Write-Screen Residual Policy

- `reservations`: sample appointment/menu/staff/clinic sources are cleared before hydration. Reservations payload supplies appointment-derived rows/detail/timeline; settings-detail supplies menu/resource/clinic labels. Synthetic history rows are disabled.
- `daily-reports`: sample form line items and sample menu/therapist options are cleared before hydration. Daily report payload supplies summary/list cards; settings-detail supplies menu/resource options.
- `settings-detail`: sample clinic/menu values are replaced by settings-detail payloads or blank fail-closed values. Unsupported menu template UI is removed from production assets.
