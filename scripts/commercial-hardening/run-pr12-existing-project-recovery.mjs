import { createHash, randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PR12_RECOVERY_TARGET,
  assertAllowedRecoveryProviderRequest,
  assertPostApplyReplayCommandEvidence,
  assertRecoveredStep01ContactCounts,
  assertTypesDriftRecoveryCrossReferences,
  buildRecoveryOperatingSystemValues,
  sha256Canonical,
} from './pr12-existing-project-recovery-contract.mjs';
import { isForbiddenAmbientCredentialName } from './pr12-source-project-provisioning-contract.mjs';
import {
  retrieveClaimBoundCredentials,
  validateDpapiCredentialResources,
  windowsPathFingerprint,
} from './pr12-windows-dpapi-credential-channel.mjs';
import {
  buildExternalReplayInputManifest,
  buildPostApplyReplayRecoveryCommandPlan,
  buildSourceReplayCommandPlan,
  compileFunctionalReplayCatalogFromSqlObservation,
  compileFreshCatalogSnapshotFromSqlObservation,
  materializeExternalReplayInputs,
  readAndVerifyFrozenMigrationInventory,
  validateMigrationHistoryParity,
} from './pr12-source-replay-catalog-contract.mjs';
import {
  buildIsolatedChildEnvironment,
  buildPinnedSpawnContract,
  observeAndAssertPinnedToolchainFiles,
  projectPinnedToolchainObservation,
} from './pr12-stage-command-runtime.mjs';
import { verifyProvisioningEvidenceDirectory } from './verify-pr12-source-project-provisioning-evidence.mjs';
import {
  REPRESENTATIVE_FIXTURE_RELATION_ORDER,
  REPRESENTATIVE_FIXTURE_SNAPSHOT_ROWS,
  compileRepresentativeFixturePlan,
  computeRepresentativeAggregateDataHash,
  createRepresentativeFixturePayloadIdentity,
  fingerprintRepresentativeFixturePayloadIdentity,
  validateRepresentativeFixtureSnapshot,
} from './pr12-representative-fixture-contract.mjs';
import {
  compareHostedTypes,
  formatGeneratedTypesWithPinnedPrettier,
  verifyPinnedPrettierRuntime,
} from './pr12-hosted-types-parity.mjs';
import {
  buildAdvisorFindingShapeDiagnostic,
  diffAdvisorSnapshots,
  normalizeAdvisorSnapshot,
  parseAdvisorCliJsonOutput,
} from './pr12-advisor-diff.mjs';
import {
  executePr12AllRoleSmokeRuntime,
  preparePr12BrowserRuntime,
  resolveAllRoleSmokeRelation,
  selectProjectRuntimeApiKeys,
} from './pr12-all-role-smoke-runtime.mjs';
import { ALL_ROLE_SMOKE_REST_CASES } from './pr12-all-role-smoke-contract.mjs';

const EXECUTION_CONFIRMATION =
  'RECOVER_EXISTING_PR12_ISOLATED_PROJECT_AND_CONTINUE';
const RECOVERY_ACTION_ID = 'PR12-RECOVER-EXISTING-ISOLATED-PROJECT-001';
const CLAIM_FILE = 'pr12-existing-project-recovery.claim.json';
const STEP01_EVIDENCE_FILE = 'pr12-step-01-recovery-result.json';
const STEP02_EVIDENCE_FILE = 'pr12-step-02-migration-replay-result.json';
const STEP03_EVIDENCE_FILE = 'pr12-step-03-representative-data-result.json';
const STEP04_EVIDENCE_FILE = 'pr12-step-04-types-parity-result.json';
const STEP05_EVIDENCE_FILE = 'pr12-step-05-advisor-scan-result.json';
const STEP06_EVIDENCE_FILE = 'pr12-step-06-all-role-smoke-result.json';
const TERMINAL_FILE = 'pr12-existing-project-recovery-terminal.json';
const RUNTIME_CREDENTIAL_CONFIG_FILE =
  'pr12-existing-project-recovery-credential-configuration-v2.json';
const CA_FILE = 'prod-ca-2021.crt';
const PINNED_CA_SHA256 =
  '700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7';
const EXPECTED_ACTION003_MANIFEST_SHA256 =
  '93d75748f2c68cf9e5bb618a04550ecc998593c2d1233a95ae8c871d8596e955';
const MAX_PROVIDER_BODY_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const CREDENTIAL_LEASE_MS = 12 * 60 * 60 * 1000;
const PREDECESSOR_RECOVERY_HEAD = '9aede531ea4496a76c9661697588f79148e03663';
const PREDECESSOR_RUNTIME_CREDENTIAL_FILE_SHA256 =
  '32a061bc72c9b79e90c13a16694a61299856a8d63a5e4f1e4d86b49e51eb7cd2';
const PREDECESSOR_TERMINAL_FILE_SHA256 =
  '2ea6c56e9642d52cf854dbfbc962265bc21a1b90d2d6f635c978825e4004b90c';
const PREDECESSOR_STEP01_FILE_SHA256 =
  '361a186aae2fdc21e649526cfa9ea92148abfd08e59b46e2a5ca7aa972b59fc7';
const PREDECESSOR_TERMINAL_SHA256 =
  'ce5f0b7e1ac12a985549c270444aba794cef578ba921ce287575b0b97c60bba2';
const PREDECESSOR_STEP01_EVIDENCE_SHA256 =
  '87c206d50515748ff31c37e808f1d9cc6e6d3547de26da753abee620d3bd4e58';
const BROKER_ABORT_RECOVERY_HEAD = 'bf4e6c9a75bab70b531680338fcbd0d7ceff51ad';
const BROKER_ABORT_RUNTIME_CREDENTIAL_FILE_SHA256 =
  '32a061bc72c9b79e90c13a16694a61299856a8d63a5e4f1e4d86b49e51eb7cd2';
const BROKER_ABORT_CLAIM_FILE_SHA256 =
  'f537baedd35d684b18277564adf49c61be7ef07765dbe794e3656d6e41e731ca';
const BROKER_ABORT_CONSUMED_FILE_SHA256 =
  'fb86373760ae50bac9699e6594d0aab326abd968cbfbe5c5460c51887c18fbf2';
const BROKER_ABORT_TERMINAL_FILE_SHA256 =
  'e1cac238244e793a32f75bea31314e95bb16d427b9ea791fc6155907a28fc090';
const BROKER_ABORT_STEP01_FILE_SHA256 =
  '8f7806798ab3b61ece8eb95f6314748db3eb575f4f093526b96f96dd3e6fd53b';
const BROKER_ABORT_TERMINAL_SHA256 =
  '5e2825b85faad85cac82af92235c95b0c5dde2cd53bd578334e8ce466ff30ae4';
const BROKER_ABORT_STEP01_EVIDENCE_SHA256 =
  '72293d11823c91d61639a9ef4d75f69b33df1b6db848db059397c736c660166c';
const ADVISOR_ABORT_RECOVERY_HEAD = 'bd456a8a29aa7202e3f5bf6643e637e256036507';
const ADVISOR_ABORT_RUNTIME_CREDENTIAL_FILE_SHA256 =
  'bb811504736409c7e177ba858bcd1c0773b57b8324bda1c0314b680da2f55069';
const ADVISOR_ABORT_CLAIM_FILE_SHA256 =
  '796c88fbf3e294ccd71439a981abacb979274433b428533205df782c1f4d3a5e';
const ADVISOR_ABORT_CONSUMED_FILE_SHA256 =
  'c995c8be02fcdd80b1a63747d87e6365894f5e57156501d6791a8454585850cd';
const ADVISOR_ABORT_TERMINAL_FILE_SHA256 =
  'f927c8d78b08d835eea463454b72b469b3b47b00bfc486de655bd9095d83f6b2';
const ADVISOR_ABORT_TERMINAL_SHA256 =
  '1e3bde11ff6afd66b95b3f76260e04e584ee38885f72aadbd74aeceaf52e9cd2';
const ADVISOR_ABORT_STEP01_FILE_SHA256 =
  '846a99c90dee41ed66a119c431d955aded75437ee3eb3dabf276ea7a8d9bc408';
const ADVISOR_ABORT_STEP01_EVIDENCE_SHA256 =
  '8f8391f61444892c3c509ff02745ab7c7a6847fb657043ba142fb6c11e9b365c';
const ADVISOR_ABORT_STEP02_FILE_SHA256 =
  '33ed7e11c228c72a154aef9d570be52a0f743aa6f1872a1ccb56b3a20624ce42';
const ADVISOR_ABORT_STEP02_EVIDENCE_SHA256 =
  '5fdb30e6cf0f55b3c3a422f847feb3295e12bd665e3879c00cacfa227577a966';
const ADVISOR_ABORT_CMD_FILE_SHA256 = Object.freeze({
  'pr12-cmd-004-intent.json':
    '2e4a957d87c8322e77cd3b08068312e02dc3a52454450ca1fc07e201c545b06d',
  'pr12-cmd-004-result.json':
    'de5e520bb7c8e72cf65ebfc2983c6e5e69d8bfe2b7266314ce290aa142f4c9c9',
  'pr12-cmd-005-intent.json':
    '35412f9a4b731e8e6b09edf8a9f32033b4161330975439e5f8f2db18c4841027',
  'pr12-cmd-005-result.json':
    '7e500385bf26d619cd5c2ce3243206d0da410affda1d86dd86f8e5c4cbfd1aa2',
  'pr12-cmd-006-intent.json':
    'b9654fea6bf8d85de8482d1c04b16fdccf16b913fcb4ca41c690823406676116',
  'pr12-cmd-006-result.json':
    'c16534b5b6a43d17cb2f2b9a4e9cfa9cd696aacc6fe643134404e2c5945d1a2a',
});
const ADVISOR_ABORT_CLI_STDOUT = '{"results":[],"message":"db advisors"}\n';
const ADVISOR_ABORT_CLI_STDOUT_SHA256 =
  'bce10ca753e505742e3ba9cb69d0507a2bbe645a064f4a72aee039846e0ad669';
const CATALOG_GAP_RECOVERY_HEAD = 'e229059c7fd407b0c6f0b16251084efceff5a79e';
const CATALOG_GAP_RUNTIME_CREDENTIAL_FILE_SHA256 =
  'bb811504736409c7e177ba858bcd1c0773b57b8324bda1c0314b680da2f55069';
const CATALOG_GAP_CLAIM_FILE_SHA256 =
  '8a44efabd857ad87f471cb9d0512ee0120a36ec166a78796c177066a280268a8';
const CATALOG_GAP_CONSUMED_FILE_SHA256 =
  'e7a67d0f018d2f9b6537e12c7b7fa6ae11415d8c8c7ae73ea1005b7deed16cab';
const CATALOG_GAP_TERMINAL_FILE_SHA256 =
  '406786916c72990bf184ce939255510fe082dde373c404823dfea6fd995b223d';
const CATALOG_GAP_TERMINAL_SHA256 =
  'b042e6859ab420fcac05c8e314b4f0916c36a54d4a6f52fa4c547446cb33c611';
const CATALOG_GAP_STEP01_FILE_SHA256 =
  'fa0e5135e596fe18b056a6b7db6aea97b9a05ff46fd55e61c3a003731c6e7dc0';
const CATALOG_GAP_STEP01_EVIDENCE_SHA256 =
  'cdfb0c93af3d4747264a2dfcd15e27c8bb146fa5cd7248813448f2a8b60bc48b';
const CATALOG_GAP_STEP02_FILE_SHA256 =
  'dafdd523127edeef818beec79bc861712dc9f0583e7a34ee29ce0abbe5e1b294';
const CATALOG_GAP_STEP02_EVIDENCE_SHA256 =
  '7547d71c1c415289abf853667cbaa0e6117bf2c0c7a6c49064247dc70c6a9439';
const CATALOG_GAP_CMD_FILE_SHA256 = Object.freeze({
  'pr12-cmd-004-intent.json':
    '3525112a745861426fce460298cb1a11e7ecbe0bfdc45a46b7083a7a8bbdf8e0',
  'pr12-cmd-004-result.json':
    'eee80de1b98f6ec6c952354d491eb8d1c3090d2dd488b9468cd7ab011f062295',
  'pr12-cmd-005-intent.json':
    '90ea56fde6e12cfbc525ac4979547e8335e78a2be27157e86c05ec4a4655a2b8',
  'pr12-cmd-005-result.json':
    'd54062cf5b9d8851591bd172d93bfb27417a6a3b21326fddefb17dd107e0fbc1',
  'pr12-cmd-006-intent.json':
    'ca8c9ffc09196627c280f8adbfa2c940927efd8fc00270b7daaa325b507ac154',
  'pr12-cmd-006-result.json':
    '61d52acb34435e3a750ec04b0bbd9f96001b9d490e0e89a918c9acc85a66a101',
  'pr12-cmd-007-intent.json':
    '5f855c5b3b37e2b844b330a67c3cfd723aaa5b0d9e2ddd8e35551d1d06dc70c3',
  'pr12-cmd-007-result.json':
    'adca3ae55b2502c9e48c9f40de92af70cfa459055619c8a6c211cb14b7f0d13c',
  'pr12-cmd-007a-intent.json':
    '119bc023a4a36a14e62d69f25c6095ece16680d32fd0b3efb7a743ba4df410e8',
  'pr12-cmd-007a-result.json':
    'e74fda414927081733c6498c963f9ee20ece06d740aa839b7dec25d5ffafc545',
});
const CATALOG_GAP_EXECUTION_BINDING_SHA256 =
  'ede63dc657f8f3b44b0f4ed65d29a66da634f60e8f9ea6d126aff742fb48319a';
const TYPES_DRIFT_RECOVERY_HEAD = 'dcd54c780f3bb56491f2f8ac9768f2908b387aee';
const TYPES_DRIFT_RUNTIME_CREDENTIAL_FILE_SHA256 =
  'bb811504736409c7e177ba858bcd1c0773b57b8324bda1c0314b680da2f55069';
const TYPES_DRIFT_CLAIM_FILE_SHA256 =
  '1dc1acfcabb998d719b38d68e3cfa4d83c4044263e53b644588e79664310cfe5';
const TYPES_DRIFT_CONSUMED_FILE_SHA256 =
  '436ade3ed520e35e5e39a7b8abc8b3b2c49830f371d3f1582c09e60bb10019cd';
const TYPES_DRIFT_TERMINAL_FILE_SHA256 =
  '45e02925f066180b023b978dd5a5ddb43ace86210b500742b482dfefe66038f7';
const TYPES_DRIFT_TERMINAL_SHA256 =
  '11fae173499610945cbc03ace7348c980ae1f5892d0a2be661a2da9568be76cd';
const TYPES_DRIFT_STEP_FILE_SHA256 = Object.freeze({
  [STEP01_EVIDENCE_FILE]:
    '308fd78552c69327e90e2cd602e5d3656578b7097d92936717b8e41bab29a9f2',
  [STEP02_EVIDENCE_FILE]:
    'ea12d1201fa1d607e9bed634b641db6242cd060df86cce2b7366b8044ce9b8b7',
  [STEP03_EVIDENCE_FILE]:
    'd7d4e5fca50f5cef329d13cf2bfe21727470d5b5f5c08479f6442921d0e00af1',
  [STEP04_EVIDENCE_FILE]:
    'feed7a7cbe19b205f017f68ddb8a4e88c644915965ce342b662db40977706887',
});
const TYPES_DRIFT_EVIDENCE_SHA256 = Object.freeze({
  [STEP01_EVIDENCE_FILE]:
    '1c1e989ab92d4835c2cedffeaa859abac53383801de8afd014a1ceebd4ddbb5d',
  [STEP02_EVIDENCE_FILE]:
    'ed46277e4924bf51c4c2a41f4d7276e1e4b7d653e03824d9018e451b32a7ef49',
  [STEP03_EVIDENCE_FILE]:
    '688d5a2e4a603db9614c9eb8c59cab78980ce01f563158d74df98d86fb460506',
  [STEP04_EVIDENCE_FILE]:
    'dba47eecd0c36c3c1724329c9dd790438777b8f9838b07bbfed1a9009bf70aac',
});
const TYPES_DRIFT_CMD_FILE_SHA256 = Object.freeze({
  'pr12-cmd-007a-intent.json':
    'b46a69a7b41e53166f8986342d163cd590395f31af7bcade062f6ec7a7ac516c',
  'pr12-cmd-007a-result.json':
    '0bc3ce4b6f13a5bc24cdda239f805e716ee1ce6a698e24ac35c075e48aff0846',
  'pr12-cmd-008-intent.json':
    'cb11653dc968c1b02d4f0fa063b72aeb94df1805a95cd1386d8b626f1ab8408a',
  'pr12-cmd-008-result.json':
    '36e4da095e6662a9c4a621bd211eb5840f3fb575ec609b83e737e025b2e14a11',
  'pr12-cmd-008a-intent.json':
    '65995c812c916a443b6eeda4db68b049da7f825e5e76af63aae717a8bdb37d4e',
  'pr12-cmd-008a-result.json':
    'c3030a80af84df872c6ffbbbc8128b24499071dbdba1a8c623a2838354b3591d',
});
const TYPES_DRIFT_EXECUTION_BINDING_SHA256 =
  '87f95fbad0ad307e81eb1d42689c187c22a3180cd34e733499f2ec8e0cc873a3';
const NORMALIZATION_DEFECT_RECOVERY_HEAD =
  '451b9a7118d46eda243043d22ed8b0c9083f3906';
const NORMALIZATION_DEFECT_RUNTIME_CREDENTIAL_FILE_SHA256 =
  'bb811504736409c7e177ba858bcd1c0773b57b8324bda1c0314b680da2f55069';
const NORMALIZATION_DEFECT_CLAIM_FILE_SHA256 =
  'de54b84f5436d2e1dbcc232c6e301db3b3065f5226b2c68909f26c35849cd52d';
const NORMALIZATION_DEFECT_CONSUMED_FILE_SHA256 =
  '12787019f392d813dbbbe8798f260dcb4e2de7f819a984f1f868f70fc4528b1e';
const NORMALIZATION_DEFECT_TERMINAL_FILE_SHA256 =
  '8e75a60012530cef1c2e02eb984030ce2afb277515a39374b92b5635bd2deb17';
const NORMALIZATION_DEFECT_TERMINAL_SHA256 =
  '4513450f778e2f48c2dba6369d8c22ab83fd1c3aa9a0514b54487d8a4df9c010';
const NORMALIZATION_DEFECT_DATABASE_IDENTITY_FILE_SHA256 =
  'a2cb050725ae24dba8393cff0bcb3ca4d2941863a8e6a5f04522edb874a4491a';
const NORMALIZATION_DEFECT_DATABASE_IDENTITY_SHA256 =
  '6a7831ea093b4d84927f99b171614022d5001f9200c797c20f39347db6e9047d';
const NORMALIZATION_DEFECT_DIAGNOSTIC_FILE_SHA256 =
  '92f9e6804b3c5fd2366edff972cc6c57d53afa662e77db7082bfba6db8fe24c9';
const NORMALIZATION_DEFECT_DIAGNOSTIC_SHA256 =
  'ba004595f3f586cc46de3ef3bc4ef2d7ee0bc9fb67621e359a5683979ddc49ae';
const NORMALIZATION_DEFECT_GENERATED_TYPES_SHA256 =
  '237a8451ff7520e88b1a6b1c8e0a0e22c44dfef2352e64db26fd28712af1ad17';
const NORMALIZATION_DEFECT_GENERATED_TYPES_BYTES = 215_954;
const NORMALIZATION_DEFECT_TELEMETRY_FILE_SHA256 =
  '37d85d1a0d4c0521821cc60deee1abcd77dab60f2b8b45d7891cdbd907a08240';
const NORMALIZATION_DEFECT_LINKED_PROJECT_FILE_SHA256 =
  'f30a26d365701eb6ba2c450386f99feea14abb3547370c23817d9f74f2de9f51';
const NORMALIZATION_DEFECT_EXECUTION_BINDING_SHA256 =
  '970e693e4468f58b862cd9e1f15d2e3933d2ed8e7db5aae33b1b3e5aefb0cf32';
const NORMALIZATION_DEFECT_BINDING_MATERIAL_SHA256 =
  'f39fc8da661fe82116070e641de8767d1b4e5218fb0933adf472292090b35b3c';
const NORMALIZATION_DEFECT_PAYLOAD_SHA256 =
  '0a4d257cd63e7076da62ba78648287006e96aadd8cc558941de6d33bf69cd339';
const NORMALIZATION_DEFECT_STEP_FILE_SHA256 = Object.freeze({
  [STEP01_EVIDENCE_FILE]:
    '308fd78552c69327e90e2cd602e5d3656578b7097d92936717b8e41bab29a9f2',
  [STEP02_EVIDENCE_FILE]:
    'ea12d1201fa1d607e9bed634b641db6242cd060df86cce2b7366b8044ce9b8b7',
  [STEP03_EVIDENCE_FILE]:
    'd7d4e5fca50f5cef329d13cf2bfe21727470d5b5f5c08479f6442921d0e00af1',
  [STEP04_EVIDENCE_FILE]:
    '3ff2d1265043c39c9b075744dcccec0ed86e0d1c7dde0bd5459e19625c078e17',
});
const NORMALIZATION_DEFECT_EVIDENCE_SHA256 = Object.freeze({
  [STEP01_EVIDENCE_FILE]:
    '1c1e989ab92d4835c2cedffeaa859abac53383801de8afd014a1ceebd4ddbb5d',
  [STEP02_EVIDENCE_FILE]:
    'ed46277e4924bf51c4c2a41f4d7276e1e4b7d653e03824d9018e451b32a7ef49',
  [STEP03_EVIDENCE_FILE]:
    '688d5a2e4a603db9614c9eb8c59cab78980ce01f563158d74df98d86fb460506',
  [STEP04_EVIDENCE_FILE]:
    '4221454f1beb88420cc6e7cb9af41e96d46b7c3ddd4c758b325fbdfa206dbd99',
});
const ADVISOR_SHAPE_DEFECT_RECOVERY_HEAD =
  '4052572bb67c9b937fc4d9ae3f53ee37510f27d2';
const ADVISOR_SHAPE_DEFECT_RUNTIME_CREDENTIAL_FILE_SHA256 =
  'bb811504736409c7e177ba858bcd1c0773b57b8324bda1c0314b680da2f55069';
const ADVISOR_SHAPE_DEFECT_CLAIM_FILE_SHA256 =
  'f22d699feeab5985ccb601ec5f24cbf1c630e75cea39d4b9c20f5c4442cdce1a';
const ADVISOR_SHAPE_DEFECT_CONSUMED_FILE_SHA256 =
  '4b8c09611edc0648962435148c47a3453b462ccfc6f791d032844276c0228ed5';
const ADVISOR_SHAPE_DEFECT_TERMINAL_FILE_SHA256 =
  '56e85aac08507f5fe599b1c4ea117d3beb3d522955cd57d47013d70d4db0cd6b';
const ADVISOR_SHAPE_DEFECT_TERMINAL_SHA256 =
  'dd52083cc0cbd026d2bcb0d431d9e36eb2422a781af30dbf57f076c4b96ebebe';
const ADVISOR_SHAPE_DEFECT_DATABASE_IDENTITY_FILE_SHA256 =
  '8037b8f770f1fd567eb9b61bd321781c772410ce7e8034598eaa9cd17a3b0251';
const ADVISOR_SHAPE_DEFECT_DATABASE_IDENTITY_SHA256 =
  'e98be433b1feb0412ea39139e2ad4ece3396566963d2bb8f72348f7ff6b2a7db';
const ADVISOR_SHAPE_DEFECT_NORMALIZATION_FILE_SHA256 =
  '4cc0048ec7e852e0212804cd53618968c18890c7e8b3cd743f88ad09683fd993';
const ADVISOR_SHAPE_DEFECT_NORMALIZATION_SHA256 =
  '95d8fabbebfaaaae721339b128bed7b07591d0f1da99d91082fa76a024fd8665';
const ADVISOR_SHAPE_DEFECT_CMD016_INTENT_FILE_SHA256 =
  '59fe2a98ad0793dedec7e1dd621a918797d8dd13a473d502ccc1d22fee48c192';
const ADVISOR_SHAPE_DEFECT_CMD016_INTENT_SHA256 =
  '473c38b9618f4d7f93e37b956b84af4b3bf1d359d2d23936c5e2f91ea8635e34';
const ADVISOR_SHAPE_DEFECT_CMD016_RESULT_FILE_SHA256 =
  '43e4f181e60572681e7d52bcb8a2dc7df3226ed14fde619c75cf6cf1ec4d128b';
const ADVISOR_SHAPE_DEFECT_CMD016_OBSERVATION_SHA256 =
  'c19914cdd019ade86bbb5df07b2e71f98b19c3d732cf79af25e405059f92ef08';
const ADVISOR_SHAPE_DEFECT_EXECUTION_BINDING_SHA256 =
  '87021e582b53e4462652adf2cfec719eb7771ba4ac28a885ec048510a71c5f9e';
const ADVISOR_SHAPE_DEFECT_BINDING_MATERIAL_SHA256 =
  '0bf99a505e26f66174078b353c2be3fb223ab04a14f73a4920eb7ff8b210eda7';
const ADVISOR_SHAPE_DEFECT_PAYLOAD_SHA256 =
  'f5e5183e62253946d84cf8719a2d21bbab6df72300354b989b62cdffa2f48771';
const ADVISOR_SHAPE_DEFECT_TELEMETRY_FILE_SHA256 =
  'd2b32d6ee5488fe6891c4f344f7cd56c8e332f7e80e0e4f57b6f4387c17969f9';
const ADVISOR_SHAPE_DEFECT_STEP_FILE_SHA256 = Object.freeze({
  [STEP01_EVIDENCE_FILE]:
    '308fd78552c69327e90e2cd602e5d3656578b7097d92936717b8e41bab29a9f2',
  [STEP02_EVIDENCE_FILE]:
    'ea12d1201fa1d607e9bed634b641db6242cd060df86cce2b7366b8044ce9b8b7',
  [STEP03_EVIDENCE_FILE]:
    'd7d4e5fca50f5cef329d13cf2bfe21727470d5b5f5c08479f6442921d0e00af1',
  [STEP04_EVIDENCE_FILE]:
    '5da18834414b6ff6a3e5107294aa6157545a39b8d7c73ecfad8f3eba549f635d',
  [STEP05_EVIDENCE_FILE]:
    '2a3de8734a804c3330456377877874a2f245c3cd86ce6708e04e091e02395c02',
});
const ADVISOR_SHAPE_DEFECT_EVIDENCE_SHA256 = Object.freeze({
  [STEP01_EVIDENCE_FILE]:
    '1c1e989ab92d4835c2cedffeaa859abac53383801de8afd014a1ceebd4ddbb5d',
  [STEP02_EVIDENCE_FILE]:
    'ed46277e4924bf51c4c2a41f4d7276e1e4b7d653e03824d9018e451b32a7ef49',
  [STEP03_EVIDENCE_FILE]:
    '688d5a2e4a603db9614c9eb8c59cab78980ce01f563158d74df98d86fb460506',
  [STEP04_EVIDENCE_FILE]:
    '1ea039b794ef0dd0b2648367b85412d5fc3aeee262e823998082416b2b3e8c81',
  [STEP05_EVIDENCE_FILE]:
    'a9ae78ebf0ba6d6874571f478ae8f597a5885f4c596390778d66abe0682a7f8a',
});

class RecoveryExecutionError extends Error {
  constructor(code) {
    super(code);
    this.name = 'RecoveryExecutionError';
    this.code = code;
  }
}

let recoveryFailureContext = null;

function fail(code) {
  throw new RecoveryExecutionError(code);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalize(value) {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('CANONICAL_VALUE_INVALID');
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) fail('CANONICAL_VALUE_INVALID');
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, canonicalize(value[key])])
  );
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

function parseCanonicalUtcTimestamp(value, code) {
  if (typeof value !== 'string' || !value.endsWith('Z')) fail(code);
  const milliseconds = Date.parse(value);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    fail(code);
  }
  return milliseconds;
}

function parseArguments(argv) {
  const allowed = new Set([
    '--execute-owner-decision',
    '--credential-config',
    '--action003-journal',
    '--action003-evidence-directory',
    '--supabase',
    '--psql',
  ]);
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      !allowed.has(flag) ||
      typeof value !== 'string' ||
      value.length === 0 ||
      value.startsWith('--') ||
      Object.hasOwn(result, flag)
    ) {
      fail('ARGUMENTS_INVALID');
    }
    result[flag] = value;
  }
  if (
    Object.keys(result).length !== allowed.size ||
    result['--execute-owner-decision'] !== EXECUTION_CONFIRMATION
  ) {
    fail('OWNER_DECISION_CONFIRMATION_INVALID');
  }
  return result;
}

function resolveExistingFile(value, code) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) fail(code);
  const resolved = path.resolve(value);
  if (
    !existsSync(resolved) ||
    lstatSync(resolved).isSymbolicLink() ||
    !statSync(resolved).isFile()
  ) {
    fail(code);
  }
  return resolved;
}

function resolveExistingDirectory(value, code) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) fail(code);
  const resolved = path.resolve(value);
  if (
    !existsSync(resolved) ||
    lstatSync(resolved).isSymbolicLink() ||
    !statSync(resolved).isDirectory()
  ) {
    fail(code);
  }
  return resolved;
}

function assertNoReparsePathIdentity(root, candidate, code) {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    fail(code);
  }
  const components = relative.length === 0 ? [] : relative.split(path.sep);
  let current = resolvedRoot;
  for (const component of components) {
    current = path.join(current, component);
    if (!existsSync(current) || lstatSync(current).isSymbolicLink()) fail(code);
    const lexical = path.resolve(current).toLowerCase();
    const actual = realpathSync.native(current).toLowerCase();
    if (lexical !== actual) fail(code);
  }
}

function readStableBytes(filename, maximumBytes, code) {
  let descriptor;
  try {
    if (lstatSync(filename).isSymbolicLink()) fail(code);
    descriptor = openSync(filename, 'r');
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size > BigInt(maximumBytes)) fail(code);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      BigInt(bytes.length) !== after.size
    ) {
      bytes.fill(0);
      fail(code);
    }
    return bytes;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function sha256StableFile(filename, maximumBytes, code) {
  const bytes = readStableBytes(filename, maximumBytes, code);
  try {
    return sha256Bytes(bytes);
  } finally {
    bytes.fill(0);
  }
}

function readCanonicalJson(filename, code) {
  const bytes = readStableBytes(filename, 1024 * 1024, code);
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const value = JSON.parse(text);
    if (`${canonicalJson(value)}\n` !== text) fail(code);
    return { value, sha256: sha256Bytes(bytes) };
  } catch (error) {
    if (error instanceof RecoveryExecutionError) throw error;
    fail(code);
  } finally {
    bytes.fill(0);
  }
}

function writeCanonicalCreateNew(filename, value, code) {
  let descriptor;
  try {
    descriptor = openSync(filename, 'wx');
    writeFileSync(descriptor, `${canonicalJson(value)}\n`, {
      encoding: 'utf8',
    });
    fsyncSync(descriptor);
  } catch {
    fail(code);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  return sha256Bytes(readFileSync(filename));
}

function writeBytesCreateNew(filename, bytes, code) {
  if (!Buffer.isBuffer(bytes)) fail(code);
  let descriptor;
  try {
    descriptor = openSync(filename, 'wx');
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } catch {
    fail(code);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  return sha256Bytes(readFileSync(filename));
}

function captureCleanGitHead(repositoryRoot) {
  const runGit = args =>
    spawnSync('git.exe', args, {
      cwd: repositoryRoot,
      env: {
        SystemRoot: process.env.SystemRoot ?? 'C:\\Windows',
        PATH: process.env.PATH ?? '',
      },
      encoding: 'utf8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
      windowsHide: true,
    });
  const head = runGit(['rev-parse', 'HEAD']);
  const status = runGit(['status', '--porcelain=v1', '--untracked-files=all']);
  if (
    head.status !== 0 ||
    status.status !== 0 ||
    !/^[a-f0-9]{40}\r?\n$/u.test(head.stdout) ||
    status.stdout !== ''
  ) {
    fail('GIT_STATE_NOT_CLEAN');
  }
  return head.stdout.trim();
}

function assertExternalSiblingPaths(
  repositoryRoot,
  action003Journal,
  action003Evidence
) {
  const actionBase = path.dirname(action003Journal);
  if (
    path.basename(action003Journal) !== 'action-003-journal' ||
    path.dirname(path.dirname(action003Evidence)) !== actionBase ||
    path.basename(path.dirname(action003Evidence)) !==
      'action-003-evidence-parent'
  ) {
    fail('ACTION003_PATH_LINKAGE_INVALID');
  }
  const relative = path.relative(repositoryRoot, actionBase);
  if (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..')
  ) {
    fail('EXTERNAL_RECOVERY_BOUNDARY_INVALID');
  }
  return {
    actionBase,
    predecessorRecoveryJournal: path.join(
      actionBase,
      'pr12-existing-project-recovery-journal'
    ),
    predecessorRecoveryEvidence: path.join(
      actionBase,
      'pr12-existing-project-recovery-evidence'
    ),
    predecessorReplayWorkdir: path.join(
      actionBase,
      'pr12-existing-project-recovery-replay-workdir'
    ),
    brokerAbortRecoveryJournal: path.join(
      actionBase,
      'pr12-existing-project-recovery-journal-cycle2'
    ),
    brokerAbortRecoveryEvidence: path.join(
      actionBase,
      'pr12-existing-project-recovery-evidence-cycle2'
    ),
    brokerAbortReplayWorkdir: path.join(
      actionBase,
      'pr12-existing-project-recovery-replay-workdir-cycle2'
    ),
    advisorAbortRecoveryJournal: path.join(
      actionBase,
      'pr12-existing-project-recovery-journal-cycle3'
    ),
    advisorAbortRecoveryEvidence: path.join(
      actionBase,
      'pr12-existing-project-recovery-evidence-cycle3'
    ),
    advisorAbortReplayWorkdir: path.join(
      actionBase,
      'pr12-existing-project-recovery-replay-workdir-cycle3'
    ),
    catalogGapRecoveryJournal: path.join(
      actionBase,
      'pr12-existing-project-recovery-journal-cycle4'
    ),
    catalogGapRecoveryEvidence: path.join(
      actionBase,
      'pr12-existing-project-recovery-evidence-cycle4'
    ),
    catalogGapReplayWorkdir: path.join(
      actionBase,
      'pr12-existing-project-recovery-replay-workdir-cycle4'
    ),
    typesDriftRecoveryJournal: path.join(
      actionBase,
      'pr12-existing-project-recovery-journal-cycle5'
    ),
    typesDriftRecoveryEvidence: path.join(
      actionBase,
      'pr12-existing-project-recovery-evidence-cycle5'
    ),
    typesDriftReplayWorkdir: path.join(
      actionBase,
      'pr12-existing-project-recovery-replay-workdir-cycle5'
    ),
    normalizationDefectRecoveryJournal: path.join(
      actionBase,
      'pr12-existing-project-recovery-journal-cycle6'
    ),
    normalizationDefectRecoveryEvidence: path.join(
      actionBase,
      'pr12-existing-project-recovery-evidence-cycle6'
    ),
    normalizationDefectReplayWorkdir: path.join(
      actionBase,
      'pr12-existing-project-recovery-replay-workdir-cycle6'
    ),
    advisorShapeDefectRecoveryJournal: path.join(
      actionBase,
      'pr12-existing-project-recovery-journal-cycle7'
    ),
    advisorShapeDefectRecoveryEvidence: path.join(
      actionBase,
      'pr12-existing-project-recovery-evidence-cycle7'
    ),
    advisorShapeDefectReplayWorkdir: path.join(
      actionBase,
      'pr12-existing-project-recovery-replay-workdir-cycle7'
    ),
    recoveryJournal: path.join(
      actionBase,
      'pr12-existing-project-recovery-journal-cycle8'
    ),
    recoveryEvidence: path.join(
      actionBase,
      'pr12-existing-project-recovery-evidence-cycle8'
    ),
    replayWorkdir: path.join(
      actionBase,
      'pr12-existing-project-recovery-replay-workdir-cycle8'
    ),
  };
}

function assertCanonicalEmbeddedSha(value, property, expected, code) {
  if (!isRecord(value) || value[property] !== expected) fail(code);
  const withoutHash = { ...value };
  delete withoutHash[property];
  if (sha256Canonical(withoutHash) !== expected) fail(code);
}

function assertExactDirectoryEntries(directory, expected, code) {
  const observed = readdirSync(directory).sort();
  const wanted = [...expected].sort();
  if (
    observed.length !== wanted.length ||
    observed.some((entry, index) => entry !== wanted[index])
  ) {
    fail(code);
  }
}

function assertPredecessorPreContactAbort(repositoryRoot, paths) {
  const journal = resolveExistingDirectory(
    paths.predecessorRecoveryJournal,
    'PREDECESSOR_RECOVERY_EVIDENCE_INVALID'
  );
  const evidence = resolveExistingDirectory(
    paths.predecessorRecoveryEvidence,
    'PREDECESSOR_RECOVERY_EVIDENCE_INVALID'
  );
  if (existsSync(paths.predecessorReplayWorkdir)) {
    fail('PREDECESSOR_RECOVERY_EVIDENCE_INVALID');
  }
  assertExactDirectoryEntries(
    journal,
    [RUNTIME_CREDENTIAL_CONFIG_FILE, TERMINAL_FILE],
    'PREDECESSOR_RECOVERY_EVIDENCE_INVALID'
  );
  assertExactDirectoryEntries(
    evidence,
    [STEP01_EVIDENCE_FILE],
    'PREDECESSOR_RECOVERY_EVIDENCE_INVALID'
  );
  captureOwnerPrivatePath(repositoryRoot, journal, 'DIRECTORY');
  captureOwnerPrivatePath(repositoryRoot, evidence, 'DIRECTORY');
  const runtimeCredentialPath = resolveExistingFile(
    path.join(journal, RUNTIME_CREDENTIAL_CONFIG_FILE),
    'PREDECESSOR_RECOVERY_EVIDENCE_INVALID'
  );
  const terminalPath = resolveExistingFile(
    path.join(journal, TERMINAL_FILE),
    'PREDECESSOR_RECOVERY_EVIDENCE_INVALID'
  );
  const step01Path = resolveExistingFile(
    path.join(evidence, STEP01_EVIDENCE_FILE),
    'PREDECESSOR_RECOVERY_EVIDENCE_INVALID'
  );
  for (const filePath of [runtimeCredentialPath, terminalPath, step01Path]) {
    captureOwnerPrivatePath(repositoryRoot, filePath, 'FILE');
  }
  const runtimeCredential = readCanonicalJson(
    runtimeCredentialPath,
    'PREDECESSOR_RECOVERY_EVIDENCE_INVALID'
  );
  const terminal = readCanonicalJson(
    terminalPath,
    'PREDECESSOR_RECOVERY_EVIDENCE_INVALID'
  );
  const step01 = readCanonicalJson(
    step01Path,
    'PREDECESSOR_RECOVERY_EVIDENCE_INVALID'
  );
  if (
    runtimeCredential.sha256 !== PREDECESSOR_RUNTIME_CREDENTIAL_FILE_SHA256 ||
    terminal.sha256 !== PREDECESSOR_TERMINAL_FILE_SHA256 ||
    step01.sha256 !== PREDECESSOR_STEP01_FILE_SHA256
  ) {
    fail('PREDECESSOR_RECOVERY_EVIDENCE_INVALID');
  }
  assertCanonicalEmbeddedSha(
    terminal.value,
    'terminalSha256',
    PREDECESSOR_TERMINAL_SHA256,
    'PREDECESSOR_RECOVERY_EVIDENCE_INVALID'
  );
  assertCanonicalEmbeddedSha(
    step01.value,
    'evidenceSha256',
    PREDECESSOR_STEP01_EVIDENCE_SHA256,
    'PREDECESSOR_RECOVERY_EVIDENCE_INVALID'
  );
  const contactCounts = isRecord(step01.value.remoteContacts)
    ? step01.value.remoteContacts
    : null;
  if (
    terminal.value.status !== 'BLOCK' ||
    terminal.value.reasonCode !== 'TOOLCHAIN_OBSERVATION_INVALID' ||
    terminal.value.gitHead !== PREDECESSOR_RECOVERY_HEAD ||
    terminal.value.projectRef !== PR12_RECOVERY_TARGET.projectRef ||
    !Array.isArray(terminal.value.completedCanonicalSteps) ||
    terminal.value.completedCanonicalSteps.length !== 0 ||
    terminal.value.blockedCanonicalStep !== '01' ||
    terminal.value.newProjectPostAttemptCount !== 0 ||
    terminal.value.productionContactCount !== 0 ||
    terminal.value.secretValuesCaptured !== false ||
    step01.value.status !== 'BLOCK' ||
    step01.value.reasonCode !== 'TOOLCHAIN_OBSERVATION_INVALID' ||
    step01.value.providerBodySha256 !== null ||
    step01.value.productionContactCount !== 0 ||
    step01.value.secretValuesCaptured !== false ||
    contactCounts === null ||
    Object.values(contactCounts).some(value => value !== 0)
  ) {
    fail('PREDECESSOR_RECOVERY_EVIDENCE_INVALID');
  }
  const linkWithoutHash = {
    status: 'PRE_CONTACT_TOOLING_ABORT_VERIFIED',
    gitHead: PREDECESSOR_RECOVERY_HEAD,
    reasonCode: 'TOOLCHAIN_OBSERVATION_INVALID',
    runtimeCredentialConfigurationFileSha256:
      PREDECESSOR_RUNTIME_CREDENTIAL_FILE_SHA256,
    terminalFileSha256: PREDECESSOR_TERMINAL_FILE_SHA256,
    terminalSha256: PREDECESSOR_TERMINAL_SHA256,
    step01FileSha256: PREDECESSOR_STEP01_FILE_SHA256,
    step01EvidenceSha256: PREDECESSOR_STEP01_EVIDENCE_SHA256,
    allRemoteContactCountsZero: true,
    credentialRetrievalCount: 0,
    newProjectPostAttemptCount: 0,
    productionContactCount: 0,
    rawPathsRetained: false,
    secretValuesCaptured: false,
  };
  return {
    ...linkWithoutHash,
    linkSha256: sha256Canonical(linkWithoutHash),
  };
}

function assertPredecessorCredentialBrokerAbort(
  repositoryRoot,
  paths,
  preContactAbort
) {
  const journal = resolveExistingDirectory(
    paths.brokerAbortRecoveryJournal,
    'BROKER_ABORT_RECOVERY_EVIDENCE_INVALID'
  );
  const evidence = resolveExistingDirectory(
    paths.brokerAbortRecoveryEvidence,
    'BROKER_ABORT_RECOVERY_EVIDENCE_INVALID'
  );
  if (existsSync(paths.brokerAbortReplayWorkdir)) {
    fail('BROKER_ABORT_RECOVERY_EVIDENCE_INVALID');
  }
  assertExactDirectoryEntries(
    journal,
    [
      RUNTIME_CREDENTIAL_CONFIG_FILE,
      CLAIM_FILE,
      'pr12-existing-project-recovery-credential-consumed.json',
      TERMINAL_FILE,
    ],
    'BROKER_ABORT_RECOVERY_EVIDENCE_INVALID'
  );
  assertExactDirectoryEntries(
    evidence,
    [STEP01_EVIDENCE_FILE],
    'BROKER_ABORT_RECOVERY_EVIDENCE_INVALID'
  );
  captureOwnerPrivatePath(repositoryRoot, journal, 'DIRECTORY');
  captureOwnerPrivatePath(repositoryRoot, evidence, 'DIRECTORY');
  const runtimeCredentialPath = resolveExistingFile(
    path.join(journal, RUNTIME_CREDENTIAL_CONFIG_FILE),
    'BROKER_ABORT_RECOVERY_EVIDENCE_INVALID'
  );
  const claimPath = resolveExistingFile(
    path.join(journal, CLAIM_FILE),
    'BROKER_ABORT_RECOVERY_EVIDENCE_INVALID'
  );
  const consumedPath = resolveExistingFile(
    path.join(
      journal,
      'pr12-existing-project-recovery-credential-consumed.json'
    ),
    'BROKER_ABORT_RECOVERY_EVIDENCE_INVALID'
  );
  const terminalPath = resolveExistingFile(
    path.join(journal, TERMINAL_FILE),
    'BROKER_ABORT_RECOVERY_EVIDENCE_INVALID'
  );
  const step01Path = resolveExistingFile(
    path.join(evidence, STEP01_EVIDENCE_FILE),
    'BROKER_ABORT_RECOVERY_EVIDENCE_INVALID'
  );
  for (const filePath of [
    runtimeCredentialPath,
    claimPath,
    terminalPath,
    step01Path,
  ]) {
    captureOwnerPrivatePath(repositoryRoot, filePath, 'FILE');
  }
  const runtimeCredential = readCanonicalJson(
    runtimeCredentialPath,
    'BROKER_ABORT_RECOVERY_EVIDENCE_INVALID'
  );
  const claim = readCanonicalJson(
    claimPath,
    'BROKER_ABORT_RECOVERY_EVIDENCE_INVALID'
  );
  const consumed = readCanonicalJson(
    consumedPath,
    'BROKER_ABORT_RECOVERY_EVIDENCE_INVALID'
  );
  const terminal = readCanonicalJson(
    terminalPath,
    'BROKER_ABORT_RECOVERY_EVIDENCE_INVALID'
  );
  const step01 = readCanonicalJson(
    step01Path,
    'BROKER_ABORT_RECOVERY_EVIDENCE_INVALID'
  );
  if (
    runtimeCredential.sha256 !== BROKER_ABORT_RUNTIME_CREDENTIAL_FILE_SHA256 ||
    claim.sha256 !== BROKER_ABORT_CLAIM_FILE_SHA256 ||
    consumed.sha256 !== BROKER_ABORT_CONSUMED_FILE_SHA256 ||
    terminal.sha256 !== BROKER_ABORT_TERMINAL_FILE_SHA256 ||
    step01.sha256 !== BROKER_ABORT_STEP01_FILE_SHA256
  ) {
    fail('BROKER_ABORT_RECOVERY_EVIDENCE_INVALID');
  }
  assertCanonicalEmbeddedSha(
    terminal.value,
    'terminalSha256',
    BROKER_ABORT_TERMINAL_SHA256,
    'BROKER_ABORT_RECOVERY_EVIDENCE_INVALID'
  );
  assertCanonicalEmbeddedSha(
    step01.value,
    'evidenceSha256',
    BROKER_ABORT_STEP01_EVIDENCE_SHA256,
    'BROKER_ABORT_RECOVERY_EVIDENCE_INVALID'
  );
  const contactCounts = isRecord(step01.value.remoteContacts)
    ? step01.value.remoteContacts
    : null;
  if (
    claim.value.actionId !== RECOVERY_ACTION_ID ||
    claim.value.state !== 'CLAIMED_CONTINUATION_NOT_STARTED' ||
    consumed.value.actionId !== RECOVERY_ACTION_ID ||
    consumed.value.state !== 'CREDENTIAL_CONSUMED_CONTINUATION_STARTED' ||
    consumed.value.claimSha256 !== claim.sha256 ||
    terminal.value.status !== 'BLOCK' ||
    terminal.value.reasonCode !== 'CREDENTIAL_BROKER_RESPONSE_REJECTED' ||
    terminal.value.gitHead !== BROKER_ABORT_RECOVERY_HEAD ||
    terminal.value.projectRef !== PR12_RECOVERY_TARGET.projectRef ||
    !Array.isArray(terminal.value.completedCanonicalSteps) ||
    terminal.value.completedCanonicalSteps.length !== 0 ||
    terminal.value.blockedCanonicalStep !== '01' ||
    terminal.value.newProjectPostAttemptCount !== 0 ||
    terminal.value.productionContactCount !== 0 ||
    terminal.value.secretValuesCaptured !== false ||
    canonicalJson(terminal.value.predecessorAttempt) !==
      canonicalJson(preContactAbort) ||
    step01.value.status !== 'BLOCK' ||
    step01.value.reasonCode !== 'CREDENTIAL_BROKER_RESPONSE_REJECTED' ||
    step01.value.providerBodySha256 !== null ||
    step01.value.productionContactCount !== 0 ||
    step01.value.secretValuesCaptured !== false ||
    canonicalJson(step01.value.predecessorAttempt) !==
      canonicalJson(preContactAbort) ||
    contactCounts === null ||
    Object.values(contactCounts).some(value => value !== 0)
  ) {
    fail('BROKER_ABORT_RECOVERY_EVIDENCE_INVALID');
  }
  hardenPath(repositoryRoot, consumedPath, 'FILE');
  const consumedAfterAclHardening = readCanonicalJson(
    consumedPath,
    'BROKER_ABORT_RECOVERY_EVIDENCE_INVALID'
  );
  if (consumedAfterAclHardening.sha256 !== consumed.sha256) {
    fail('BROKER_ABORT_RECOVERY_EVIDENCE_INVALID');
  }
  const linkWithoutHash = {
    status: 'PRE_PROVIDER_CREDENTIAL_BROKER_ABORT_VERIFIED',
    gitHead: BROKER_ABORT_RECOVERY_HEAD,
    reasonCode: 'CREDENTIAL_BROKER_RESPONSE_REJECTED',
    runtimeCredentialConfigurationFileSha256:
      BROKER_ABORT_RUNTIME_CREDENTIAL_FILE_SHA256,
    claimFileSha256: BROKER_ABORT_CLAIM_FILE_SHA256,
    consumedReceiptFileSha256: BROKER_ABORT_CONSUMED_FILE_SHA256,
    terminalFileSha256: BROKER_ABORT_TERMINAL_FILE_SHA256,
    terminalSha256: BROKER_ABORT_TERMINAL_SHA256,
    step01FileSha256: BROKER_ABORT_STEP01_FILE_SHA256,
    step01EvidenceSha256: BROKER_ABORT_STEP01_EVIDENCE_SHA256,
    credentialBrokerInvocationCount: 1,
    credentialDecryptionCompletedBeforeResponseAbort: true,
    consumedReceiptAclRemediatedWithoutContentMutation: true,
    allProviderAndDatabaseContactCountsZero: true,
    newProjectPostAttemptCount: 0,
    productionContactCount: 0,
    rawPathsRetained: false,
    secretValuesCaptured: false,
  };
  return {
    ...linkWithoutHash,
    linkSha256: sha256Canonical(linkWithoutHash),
  };
}

function assertPredecessorAdvisorParserAbort(
  repositoryRoot,
  paths,
  predecessorAttempts
) {
  const code = 'ADVISOR_ABORT_RECOVERY_EVIDENCE_INVALID';
  const journal = resolveExistingDirectory(
    paths.advisorAbortRecoveryJournal,
    code
  );
  const evidence = resolveExistingDirectory(
    paths.advisorAbortRecoveryEvidence,
    code
  );
  resolveExistingDirectory(paths.advisorAbortReplayWorkdir, code);
  const commandFilenames = Object.keys(ADVISOR_ABORT_CMD_FILE_SHA256);
  assertExactDirectoryEntries(
    journal,
    [
      ...commandFilenames,
      RUNTIME_CREDENTIAL_CONFIG_FILE,
      'pr12-existing-project-recovery-credential-consumed.json',
      TERMINAL_FILE,
      CLAIM_FILE,
    ],
    code
  );
  assertExactDirectoryEntries(
    evidence,
    [STEP01_EVIDENCE_FILE, STEP02_EVIDENCE_FILE, CA_FILE],
    code
  );
  captureOwnerPrivatePath(repositoryRoot, journal, 'DIRECTORY');
  captureOwnerPrivatePath(repositoryRoot, evidence, 'DIRECTORY');

  const journalFiles = {
    runtimeCredential: path.join(journal, RUNTIME_CREDENTIAL_CONFIG_FILE),
    claim: path.join(journal, CLAIM_FILE),
    consumed: path.join(
      journal,
      'pr12-existing-project-recovery-credential-consumed.json'
    ),
    terminal: path.join(journal, TERMINAL_FILE),
  };
  const evidenceFiles = {
    step01: path.join(evidence, STEP01_EVIDENCE_FILE),
    step02: path.join(evidence, STEP02_EVIDENCE_FILE),
    ca: path.join(evidence, CA_FILE),
  };
  const allFiles = [
    ...Object.values(journalFiles),
    ...Object.values(evidenceFiles),
    ...commandFilenames.map(filename => path.join(journal, filename)),
  ];
  for (const filename of allFiles) {
    resolveExistingFile(filename, code);
    captureOwnerPrivatePath(repositoryRoot, filename, 'FILE');
  }

  const runtimeCredential = readCanonicalJson(
    journalFiles.runtimeCredential,
    code
  );
  const claim = readCanonicalJson(journalFiles.claim, code);
  const consumed = readCanonicalJson(journalFiles.consumed, code);
  const terminal = readCanonicalJson(journalFiles.terminal, code);
  const step01 = readCanonicalJson(evidenceFiles.step01, code);
  const step02 = readCanonicalJson(evidenceFiles.step02, code);
  const caBytes = readStableBytes(evidenceFiles.ca, 16 * 1024, code);
  const caSha256 = sha256Bytes(caBytes);
  caBytes.fill(0);
  const commandArtifacts = Object.fromEntries(
    commandFilenames.map(filename => {
      const snapshot = readCanonicalJson(path.join(journal, filename), code);
      if (snapshot.sha256 !== ADVISOR_ABORT_CMD_FILE_SHA256[filename]) {
        fail(code);
      }
      return [filename, snapshot];
    })
  );

  if (
    runtimeCredential.sha256 !== ADVISOR_ABORT_RUNTIME_CREDENTIAL_FILE_SHA256 ||
    claim.sha256 !== ADVISOR_ABORT_CLAIM_FILE_SHA256 ||
    consumed.sha256 !== ADVISOR_ABORT_CONSUMED_FILE_SHA256 ||
    terminal.sha256 !== ADVISOR_ABORT_TERMINAL_FILE_SHA256 ||
    step01.sha256 !== ADVISOR_ABORT_STEP01_FILE_SHA256 ||
    step02.sha256 !== ADVISOR_ABORT_STEP02_FILE_SHA256 ||
    caSha256 !== PINNED_CA_SHA256
  ) {
    fail(code);
  }
  assertCanonicalEmbeddedSha(
    terminal.value,
    'terminalSha256',
    ADVISOR_ABORT_TERMINAL_SHA256,
    code
  );
  assertCanonicalEmbeddedSha(
    step01.value,
    'evidenceSha256',
    ADVISOR_ABORT_STEP01_EVIDENCE_SHA256,
    code
  );
  assertCanonicalEmbeddedSha(
    step02.value,
    'evidenceSha256',
    ADVISOR_ABORT_STEP02_EVIDENCE_SHA256,
    code
  );

  const provider = step01.value.provider;
  const projection = isRecord(provider) ? provider.projection : null;
  const database = step01.value.database;
  const compute = step01.value.compute;
  const decision = step01.value.decision;
  const remoteContacts = step01.value.remoteContacts;
  const verifiedRemoteContacts =
    assertRecoveredStep01ContactCounts(remoteContacts);
  const productionBoundary = step01.value.productionBoundary;
  const completedCommandIds = [
    'PR12-CMD-003',
    'PR12-CMD-004',
    'PR12-CMD-005',
    'PR12-CMD-006',
  ];
  const observations = Array.isArray(step02.value.commandObservations)
    ? step02.value.commandObservations
    : [];
  const cmd006 = observations.find(
    observation => observation.commandId === 'PR12-CMD-006'
  );
  const cmd006Result = commandArtifacts['pr12-cmd-006-result.json'].value;
  if (
    claim.value.actionId !== RECOVERY_ACTION_ID ||
    claim.value.state !== 'CLAIMED_CONTINUATION_NOT_STARTED' ||
    consumed.value.actionId !== RECOVERY_ACTION_ID ||
    consumed.value.state !== 'CREDENTIAL_CONSUMED_CONTINUATION_STARTED' ||
    consumed.value.claimSha256 !== claim.sha256 ||
    terminal.value.status !== 'BLOCK' ||
    terminal.value.reasonCode !== 'ADVISOR_OUTPUT_INVALID' ||
    terminal.value.gitHead !== ADVISOR_ABORT_RECOVERY_HEAD ||
    terminal.value.projectRef !== PR12_RECOVERY_TARGET.projectRef ||
    canonicalJson(terminal.value.completedCanonicalSteps) !==
      canonicalJson(['01']) ||
    terminal.value.blockedCanonicalStep !== '02' ||
    canonicalJson(terminal.value.predecessorAttempts) !==
      canonicalJson(predecessorAttempts) ||
    terminal.value.newProjectPostAttemptCount !== 0 ||
    terminal.value.productionContactCount !== 0 ||
    terminal.value.secretValuesCaptured !== false ||
    step01.value.status !== 'PASS' ||
    canonicalJson(step01.value.predecessorAttempts) !==
      canonicalJson(predecessorAttempts) ||
    !isRecord(provider) ||
    provider.httpStatus !== 200 ||
    !isRecord(projection) ||
    projection.projectRef !== PR12_RECOVERY_TARGET.projectRef ||
    projection.organizationId !== PR12_RECOVERY_TARGET.organizationId ||
    projection.region !== PR12_RECOVERY_TARGET.region ||
    projection.status !== 'ACTIVE_HEALTHY' ||
    !isRecord(database) ||
    database.status !== 'REACHABLE' ||
    database.systemIdentifier !== '7666052913346410626' ||
    database.projectRef !== PR12_RECOVERY_TARGET.projectRef ||
    database.connectionMode !== 'DIRECT' ||
    database.tls?.verifiedMode !== 'verify-full' ||
    !isRecord(compute) ||
    compute.verification !== 'UNVERIFIED' ||
    compute.reason !== 'PROVIDER_RESPONSE_INVALID' ||
    !isRecord(decision) ||
    decision.result !== 'PASS' ||
    decision.nextStep !== '02' ||
    decision.productionEquivalentPerformanceQualificationDeferred !== true ||
    !isRecord(productionBoundary) ||
    Object.values(productionBoundary).some(value =>
      typeof value === 'number' ? value !== 0 : false
    ) ||
    step01.value.secretValuesCaptured !== false ||
    step02.value.status !== 'BLOCK' ||
    step02.value.reasonCode !== 'ADVISOR_OUTPUT_INVALID' ||
    step02.value.projectRef !== PR12_RECOVERY_TARGET.projectRef ||
    step02.value.databaseSystemIdentifier !== '7666052913346410626' ||
    canonicalJson(step02.value.completedCommandIds) !==
      canonicalJson(completedCommandIds) ||
    observations.length !== completedCommandIds.length ||
    observations.some(
      (observation, index) =>
        observation.commandId !== completedCommandIds[index] ||
        observation.outcome !== 'SUCCEEDED' ||
        observation.dispatchCount !== 1 ||
        observation.wrapperRetryCount !== 0
    ) ||
    step02.value.lastDispatchedCommand?.commandId !== 'PR12-CMD-006' ||
    step02.value.lastDispatchedCommand?.mutation !== false ||
    step02.value.mutationOutcomeUnknown !== false ||
    step02.value.secretValuesCaptured !== false ||
    !isRecord(cmd006) ||
    cmd006.stdoutBytes !== Buffer.byteLength(ADVISOR_ABORT_CLI_STDOUT) ||
    cmd006.stdoutSha256 !== ADVISOR_ABORT_CLI_STDOUT_SHA256 ||
    cmd006Result.stdoutBytes !== Buffer.byteLength(ADVISOR_ABORT_CLI_STDOUT) ||
    cmd006Result.stdoutSha256 !== ADVISOR_ABORT_CLI_STDOUT_SHA256 ||
    sha256Bytes(Buffer.from(ADVISOR_ABORT_CLI_STDOUT, 'utf8')) !==
      ADVISOR_ABORT_CLI_STDOUT_SHA256
  ) {
    fail(code);
  }

  for (const commandId of ['004', '005', '006']) {
    const intentName = `pr12-cmd-${commandId}-intent.json`;
    const resultName = `pr12-cmd-${commandId}-result.json`;
    const observation = observations.find(
      value => value.commandId === `PR12-CMD-${commandId}`
    );
    if (
      observation?.intentArtifactSha256 !==
        commandArtifacts[intentName].sha256 ||
      observation?.resultArtifactSha256 !== commandArtifacts[resultName].sha256
    ) {
      fail(code);
    }
  }

  const linkWithoutHash = {
    status: 'PRE_MUTATION_ADVISOR_PARSER_ABORT_VERIFIED',
    gitHead: ADVISOR_ABORT_RECOVERY_HEAD,
    reasonCode: 'ADVISOR_OUTPUT_INVALID',
    step01Result: 'PASS',
    step01FileSha256: ADVISOR_ABORT_STEP01_FILE_SHA256,
    step01EvidenceSha256: ADVISOR_ABORT_STEP01_EVIDENCE_SHA256,
    step02Result: 'BLOCK',
    step02FileSha256: ADVISOR_ABORT_STEP02_FILE_SHA256,
    step02EvidenceSha256: ADVISOR_ABORT_STEP02_EVIDENCE_SHA256,
    completedCommandIds,
    migrationApplyDispatchCount: 0,
    mutationOutcomeUnknown: false,
    advisorCliJsonEnvelope: {
      format: 'SUPABASE_CLI_2_109_0_JSON_SUCCESS',
      stdoutBytes: Buffer.byteLength(ADVISOR_ABORT_CLI_STDOUT),
      stdoutSha256: ADVISOR_ABORT_CLI_STDOUT_SHA256,
      parsedFindingCount: 0,
    },
    credentialBrokerInvocationCount: 1,
    projectStateGetCount: verifiedRemoteContacts.projectStateGetCount,
    computeAddonGetCount: verifiedRemoteContacts.computeAddonGetCount,
    publicCaGetCount: verifiedRemoteContacts.publicCaGetCount,
    directDatabaseConnectionCount:
      verifiedRemoteContacts.directDatabaseConnectionCount,
    newProjectPostAttemptCount: 0,
    productionContactCount: 0,
    rawPathsRetained: false,
    secretValuesCaptured: false,
  };
  return {
    ...linkWithoutHash,
    linkSha256: sha256Canonical(linkWithoutHash),
  };
}

function assertPredecessorCatalogGapAbort(
  repositoryRoot,
  paths,
  predecessorAttempts
) {
  const code = 'CATALOG_GAP_RECOVERY_EVIDENCE_INVALID';
  const journal = resolveExistingDirectory(
    paths.catalogGapRecoveryJournal,
    code
  );
  const evidence = resolveExistingDirectory(
    paths.catalogGapRecoveryEvidence,
    code
  );
  resolveExistingDirectory(paths.catalogGapReplayWorkdir, code);
  const commandFilenames = Object.keys(CATALOG_GAP_CMD_FILE_SHA256);
  assertExactDirectoryEntries(
    journal,
    [
      ...commandFilenames,
      RUNTIME_CREDENTIAL_CONFIG_FILE,
      'pr12-existing-project-recovery-credential-consumed.json',
      TERMINAL_FILE,
      CLAIM_FILE,
    ],
    code
  );
  assertExactDirectoryEntries(
    evidence,
    [STEP01_EVIDENCE_FILE, STEP02_EVIDENCE_FILE, CA_FILE],
    code
  );
  captureOwnerPrivatePath(repositoryRoot, journal, 'DIRECTORY');
  captureOwnerPrivatePath(repositoryRoot, evidence, 'DIRECTORY');

  const journalFiles = {
    runtimeCredential: path.join(journal, RUNTIME_CREDENTIAL_CONFIG_FILE),
    claim: path.join(journal, CLAIM_FILE),
    consumed: path.join(
      journal,
      'pr12-existing-project-recovery-credential-consumed.json'
    ),
    terminal: path.join(journal, TERMINAL_FILE),
  };
  const evidenceFiles = {
    step01: path.join(evidence, STEP01_EVIDENCE_FILE),
    step02: path.join(evidence, STEP02_EVIDENCE_FILE),
    ca: path.join(evidence, CA_FILE),
  };
  const allFiles = [
    ...Object.values(journalFiles),
    ...Object.values(evidenceFiles),
    ...commandFilenames.map(filename => path.join(journal, filename)),
  ];
  for (const filename of allFiles) {
    resolveExistingFile(filename, code);
    captureOwnerPrivatePath(repositoryRoot, filename, 'FILE');
  }

  const runtimeCredential = readCanonicalJson(
    journalFiles.runtimeCredential,
    code
  );
  const claim = readCanonicalJson(journalFiles.claim, code);
  const consumed = readCanonicalJson(journalFiles.consumed, code);
  const terminal = readCanonicalJson(journalFiles.terminal, code);
  const step01 = readCanonicalJson(evidenceFiles.step01, code);
  const step02 = readCanonicalJson(evidenceFiles.step02, code);
  const caBytes = readStableBytes(evidenceFiles.ca, 16 * 1024, code);
  const caSha256 = sha256Bytes(caBytes);
  caBytes.fill(0);
  const commandArtifacts = Object.fromEntries(
    commandFilenames.map(filename => {
      const snapshot = readCanonicalJson(path.join(journal, filename), code);
      if (snapshot.sha256 !== CATALOG_GAP_CMD_FILE_SHA256[filename]) {
        fail(code);
      }
      return [filename, snapshot];
    })
  );
  if (
    runtimeCredential.sha256 !== CATALOG_GAP_RUNTIME_CREDENTIAL_FILE_SHA256 ||
    claim.sha256 !== CATALOG_GAP_CLAIM_FILE_SHA256 ||
    consumed.sha256 !== CATALOG_GAP_CONSUMED_FILE_SHA256 ||
    terminal.sha256 !== CATALOG_GAP_TERMINAL_FILE_SHA256 ||
    step01.sha256 !== CATALOG_GAP_STEP01_FILE_SHA256 ||
    step02.sha256 !== CATALOG_GAP_STEP02_FILE_SHA256 ||
    caSha256 !== PINNED_CA_SHA256
  ) {
    fail(code);
  }
  assertCanonicalEmbeddedSha(
    terminal.value,
    'terminalSha256',
    CATALOG_GAP_TERMINAL_SHA256,
    code
  );
  assertCanonicalEmbeddedSha(
    step01.value,
    'evidenceSha256',
    CATALOG_GAP_STEP01_EVIDENCE_SHA256,
    code
  );
  assertCanonicalEmbeddedSha(
    step02.value,
    'evidenceSha256',
    CATALOG_GAP_STEP02_EVIDENCE_SHA256,
    code
  );

  const provider = step01.value.provider;
  const projection = isRecord(provider) ? provider.projection : null;
  const database = step01.value.database;
  const compute = step01.value.compute;
  const decision = step01.value.decision;
  const productionBoundary = step01.value.productionBoundary;
  const verifiedRemoteContacts = assertRecoveredStep01ContactCounts(
    step01.value.remoteContacts
  );
  const completedCommandIds = [
    'PR12-CMD-003',
    'PR12-CMD-004',
    'PR12-CMD-005',
    'PR12-CMD-006',
    'PR12-CMD-007',
    'PR12-CMD-007A',
  ];
  const observations = Array.isArray(step02.value.commandObservations)
    ? step02.value.commandObservations
    : [];
  const cmd006 = observations.find(
    observation => observation.commandId === 'PR12-CMD-006'
  );
  const cmd007 = observations.find(
    observation => observation.commandId === 'PR12-CMD-007'
  );
  const cmd007Intent = commandArtifacts['pr12-cmd-007-intent.json'].value;
  const cmd007Result = commandArtifacts['pr12-cmd-007-result.json'].value;
  const cmd007a = observations.find(
    observation => observation.commandId === 'PR12-CMD-007A'
  );
  const cmd007aIntent = commandArtifacts['pr12-cmd-007a-intent.json'].value;
  const verifiedPostApplyCommands = assertPostApplyReplayCommandEvidence({
    migrationApply: {
      intent: cmd007Intent,
      intentFileSha256: commandArtifacts['pr12-cmd-007-intent.json'].sha256,
      result: cmd007Result,
    },
    catalogCapture: {
      intent: cmd007aIntent,
      intentFileSha256: commandArtifacts['pr12-cmd-007a-intent.json'].sha256,
      result: commandArtifacts['pr12-cmd-007a-result.json'].value,
    },
  });
  if (
    claim.value.actionId !== RECOVERY_ACTION_ID ||
    claim.value.state !== 'CLAIMED_CONTINUATION_NOT_STARTED' ||
    claim.value.derivedExecutionBindingSha256 !==
      CATALOG_GAP_EXECUTION_BINDING_SHA256 ||
    consumed.value.actionId !== RECOVERY_ACTION_ID ||
    consumed.value.state !== 'CREDENTIAL_CONSUMED_CONTINUATION_STARTED' ||
    consumed.value.claimSha256 !== claim.sha256 ||
    terminal.value.status !== 'BLOCK' ||
    terminal.value.reasonCode !== 'DATA_API_CONFIGURATION_NOT_OBSERVED' ||
    terminal.value.gitHead !== CATALOG_GAP_RECOVERY_HEAD ||
    terminal.value.projectRef !== PR12_RECOVERY_TARGET.projectRef ||
    canonicalJson(terminal.value.completedCanonicalSteps) !==
      canonicalJson(['01']) ||
    terminal.value.blockedCanonicalStep !== '02' ||
    canonicalJson(terminal.value.predecessorAttempts) !==
      canonicalJson(predecessorAttempts) ||
    terminal.value.newProjectPostAttemptCount !== 0 ||
    terminal.value.productionContactCount !== 0 ||
    terminal.value.secretValuesCaptured !== false ||
    step01.value.status !== 'PASS' ||
    canonicalJson(step01.value.predecessorAttempts) !==
      canonicalJson(predecessorAttempts) ||
    !isRecord(provider) ||
    provider.httpStatus !== 200 ||
    !isRecord(projection) ||
    projection.projectRef !== PR12_RECOVERY_TARGET.projectRef ||
    projection.organizationId !== PR12_RECOVERY_TARGET.organizationId ||
    projection.region !== PR12_RECOVERY_TARGET.region ||
    projection.status !== 'ACTIVE_HEALTHY' ||
    !isRecord(database) ||
    database.status !== 'REACHABLE' ||
    database.systemIdentifier !== '7666052913346410626' ||
    database.projectRef !== PR12_RECOVERY_TARGET.projectRef ||
    database.connectionMode !== 'DIRECT' ||
    database.tls?.verifiedMode !== 'verify-full' ||
    !isRecord(compute) ||
    compute.verification !== 'UNVERIFIED' ||
    !isRecord(decision) ||
    decision.result !== 'PASS' ||
    decision.nextStep !== '02' ||
    decision.productionEquivalentPerformanceQualificationDeferred !== true ||
    !isRecord(productionBoundary) ||
    Object.values(productionBoundary).some(value =>
      typeof value === 'number' ? value !== 0 : false
    ) ||
    step01.value.secretValuesCaptured !== false ||
    step02.value.status !== 'BLOCK' ||
    step02.value.reasonCode !== 'DATA_API_CONFIGURATION_NOT_OBSERVED' ||
    step02.value.projectRef !== PR12_RECOVERY_TARGET.projectRef ||
    step02.value.databaseSystemIdentifier !== '7666052913346410626' ||
    canonicalJson(step02.value.completedCommandIds) !==
      canonicalJson(completedCommandIds) ||
    observations.length !== completedCommandIds.length ||
    observations.some(
      (observation, index) =>
        observation.commandId !== completedCommandIds[index] ||
        observation.outcome !== 'SUCCEEDED' ||
        observation.dispatchCount !== 1 ||
        observation.wrapperRetryCount !== 0
    ) ||
    step02.value.lastDispatchedCommand?.commandId !== 'PR12-CMD-007A' ||
    step02.value.lastDispatchedCommand?.mutation !== false ||
    step02.value.mutationOutcomeUnknown !== false ||
    step02.value.secretValuesCaptured !== false ||
    !isRecord(cmd006) ||
    cmd006.stdoutBytes !== Buffer.byteLength(ADVISOR_ABORT_CLI_STDOUT) ||
    cmd006.stdoutSha256 !== ADVISOR_ABORT_CLI_STDOUT_SHA256 ||
    !isRecord(cmd007) ||
    cmd007.outcome !== 'SUCCEEDED' ||
    cmd007.timedOut !== false ||
    !isRecord(cmd007a) ||
    cmd007a.outcome !== 'SUCCEEDED'
  ) {
    fail(code);
  }
  for (const commandId of ['004', '005', '006', '007', '007a']) {
    const intentName = `pr12-cmd-${commandId}-intent.json`;
    const resultName = `pr12-cmd-${commandId}-result.json`;
    const observation = observations.find(
      value => value.commandId === `PR12-CMD-${commandId.toUpperCase()}`
    );
    if (
      observation?.intentArtifactSha256 !==
        commandArtifacts[intentName].sha256 ||
      observation?.resultArtifactSha256 !== commandArtifacts[resultName].sha256
    ) {
      fail(code);
    }
  }

  const linkWithoutHash = {
    status: 'POST_APPLY_CATALOG_GAP_VERIFIED',
    gitHead: CATALOG_GAP_RECOVERY_HEAD,
    reasonCode: 'DATA_API_CONFIGURATION_NOT_OBSERVED',
    step01Result: 'PASS',
    step01FileSha256: CATALOG_GAP_STEP01_FILE_SHA256,
    step01EvidenceSha256: CATALOG_GAP_STEP01_EVIDENCE_SHA256,
    step02Result: 'BLOCK',
    step02FileSha256: CATALOG_GAP_STEP02_FILE_SHA256,
    step02EvidenceSha256: CATALOG_GAP_STEP02_EVIDENCE_SHA256,
    executionBindingSha256: CATALOG_GAP_EXECUTION_BINDING_SHA256,
    advisorBefore: {
      capturedAt: cmd006.completedAt,
      stdoutBytes: cmd006.stdoutBytes,
      stdoutSha256: cmd006.stdoutSha256,
      findingCount: 0,
    },
    completedCommandIds,
    migrationApplyDispatchCount: 1,
    migrationApplyOutcome: 'SUCCEEDED',
    migrationApplyRedispatchAllowed: false,
    mutationOutcomeUnknown: false,
    lastReadOnlyCommand: 'PR12-CMD-007A',
    verifiedPostApplyCommands,
    projectStateGetCount: verifiedRemoteContacts.projectStateGetCount,
    computeAddonGetCount: verifiedRemoteContacts.computeAddonGetCount,
    publicCaGetCount: verifiedRemoteContacts.publicCaGetCount,
    directDatabaseConnectionCount:
      verifiedRemoteContacts.directDatabaseConnectionCount,
    newProjectPostAttemptCount: 0,
    productionContactCount: 0,
    rawPathsRetained: false,
    secretValuesCaptured: false,
  };
  return {
    ...linkWithoutHash,
    linkSha256: sha256Canonical(linkWithoutHash),
  };
}

function assertPredecessorTypesDriftAbort(
  repositoryRoot,
  paths,
  predecessorAttempts
) {
  const code = 'TYPES_DRIFT_RECOVERY_EVIDENCE_INVALID';
  const journal = resolveExistingDirectory(
    paths.typesDriftRecoveryJournal,
    code
  );
  const evidence = resolveExistingDirectory(
    paths.typesDriftRecoveryEvidence,
    code
  );
  resolveExistingDirectory(paths.typesDriftReplayWorkdir, code);
  const commandFilenames = Object.keys(TYPES_DRIFT_CMD_FILE_SHA256);
  assertExactDirectoryEntries(
    journal,
    [
      ...commandFilenames,
      RUNTIME_CREDENTIAL_CONFIG_FILE,
      'pr12-existing-project-recovery-credential-consumed.json',
      TERMINAL_FILE,
      CLAIM_FILE,
    ],
    code
  );
  assertExactDirectoryEntries(
    evidence,
    [...Object.keys(TYPES_DRIFT_STEP_FILE_SHA256), CA_FILE],
    code
  );
  captureOwnerPrivatePath(repositoryRoot, journal, 'DIRECTORY');
  captureOwnerPrivatePath(repositoryRoot, evidence, 'DIRECTORY');

  const journalFiles = {
    runtimeCredential: path.join(journal, RUNTIME_CREDENTIAL_CONFIG_FILE),
    claim: path.join(journal, CLAIM_FILE),
    consumed: path.join(
      journal,
      'pr12-existing-project-recovery-credential-consumed.json'
    ),
    terminal: path.join(journal, TERMINAL_FILE),
  };
  const evidenceFiles = Object.fromEntries(
    Object.keys(TYPES_DRIFT_STEP_FILE_SHA256).map(filename => [
      filename,
      path.join(evidence, filename),
    ])
  );
  const allFiles = [
    ...Object.values(journalFiles),
    ...Object.values(evidenceFiles),
    path.join(evidence, CA_FILE),
    ...commandFilenames.map(filename => path.join(journal, filename)),
  ];
  for (const filename of allFiles) {
    resolveExistingFile(filename, code);
    captureOwnerPrivatePath(repositoryRoot, filename, 'FILE');
  }

  const runtimeCredential = readCanonicalJson(
    journalFiles.runtimeCredential,
    code
  );
  const claim = readCanonicalJson(journalFiles.claim, code);
  const consumed = readCanonicalJson(journalFiles.consumed, code);
  const terminal = readCanonicalJson(journalFiles.terminal, code);
  const steps = Object.fromEntries(
    Object.entries(evidenceFiles).map(([filename, artifactPath]) => [
      filename,
      readCanonicalJson(artifactPath, code),
    ])
  );
  const commandArtifacts = Object.fromEntries(
    commandFilenames.map(filename => [
      filename,
      readCanonicalJson(path.join(journal, filename), code),
    ])
  );
  if (
    runtimeCredential.sha256 !== TYPES_DRIFT_RUNTIME_CREDENTIAL_FILE_SHA256 ||
    claim.sha256 !== TYPES_DRIFT_CLAIM_FILE_SHA256 ||
    consumed.sha256 !== TYPES_DRIFT_CONSUMED_FILE_SHA256 ||
    terminal.sha256 !== TYPES_DRIFT_TERMINAL_FILE_SHA256 ||
    sha256Bytes(readFileSync(path.join(evidence, CA_FILE))) !==
      PINNED_CA_SHA256 ||
    Object.entries(steps).some(
      ([filename, snapshot]) =>
        snapshot.sha256 !== TYPES_DRIFT_STEP_FILE_SHA256[filename]
    ) ||
    Object.entries(commandArtifacts).some(
      ([filename, snapshot]) =>
        snapshot.sha256 !== TYPES_DRIFT_CMD_FILE_SHA256[filename]
    )
  ) {
    fail(code);
  }
  assertCanonicalEmbeddedSha(
    terminal.value,
    'terminalSha256',
    TYPES_DRIFT_TERMINAL_SHA256,
    code
  );
  for (const [filename, snapshot] of Object.entries(steps)) {
    assertCanonicalEmbeddedSha(
      snapshot.value,
      'evidenceSha256',
      TYPES_DRIFT_EVIDENCE_SHA256[filename],
      code
    );
  }
  const step01 = steps[STEP01_EVIDENCE_FILE].value;
  const step02 = steps[STEP02_EVIDENCE_FILE].value;
  const step03 = steps[STEP03_EVIDENCE_FILE].value;
  const step04 = steps[STEP04_EVIDENCE_FILE].value;
  const fixtureIntent = commandArtifacts['pr12-cmd-008-intent.json'].value;
  const fixtureResult = commandArtifacts['pr12-cmd-008-result.json'].value;
  const catalogGapAttempt = predecessorAttempts.at(-1);
  const verifiedRecoveryChain = assertTypesDriftRecoveryCrossReferences({
    catalogGapAttempt,
    step02,
    step03,
    fixtureIntentFileSha256:
      TYPES_DRIFT_CMD_FILE_SHA256['pr12-cmd-008-intent.json'],
    fixtureResultFileSha256:
      TYPES_DRIFT_CMD_FILE_SHA256['pr12-cmd-008-result.json'],
    fixtureResult,
  });
  if (
    claim.value.actionId !== RECOVERY_ACTION_ID ||
    claim.value.state !== 'CLAIMED_CONTINUATION_NOT_STARTED' ||
    claim.value.derivedExecutionBindingSha256 !==
      TYPES_DRIFT_EXECUTION_BINDING_SHA256 ||
    consumed.value.actionId !== RECOVERY_ACTION_ID ||
    consumed.value.state !== 'CREDENTIAL_CONSUMED_CONTINUATION_STARTED' ||
    consumed.value.claimSha256 !== claim.sha256 ||
    terminal.value.gitHead !== TYPES_DRIFT_RECOVERY_HEAD ||
    terminal.value.status !== 'BLOCK' ||
    terminal.value.reasonCode !== 'GENERATED_TYPES_DRIFT' ||
    canonicalJson(terminal.value.completedCanonicalSteps) !==
      canonicalJson(['01', '02', '03']) ||
    terminal.value.blockedCanonicalStep !== '04' ||
    canonicalJson(terminal.value.predecessorAttempts) !==
      canonicalJson(predecessorAttempts) ||
    terminal.value.newProjectPostAttemptCount !== 0 ||
    terminal.value.productionContactCount !== 0 ||
    step01.status !== 'PASS' ||
    step01.decision?.result !== 'PASS' ||
    step01.database?.status !== 'REACHABLE' ||
    step01.database?.systemIdentifier !== '7666052913346410626' ||
    step02.status !== 'PASS' ||
    step02.postApplyRecovery?.migrationApplyDispatchCount !== 1 ||
    step02.postApplyRecovery?.migrationApplyOutcome !== 'SUCCEEDED' ||
    step02.postApplyRecovery?.migrationApplyRedispatched !== false ||
    step03.status !== 'PASS' ||
    step03.explicitRows !== 83 ||
    step03.derivedRows !== 12 ||
    step03.verifiedRows !== 95 ||
    step04.status !== 'BLOCK' ||
    step04.reasonCode !== 'GENERATED_TYPES_DRIFT' ||
    fixtureIntent.commandId !== 'PR12-CMD-008' ||
    fixtureIntent.targetProjectRef !== PR12_RECOVERY_TARGET.projectRef ||
    fixtureIntent.targetDirectHost !== PR12_RECOVERY_TARGET.directHost ||
    fixtureIntent.mutation !== true ||
    fixtureIntent.dispatchMaximum !== 1 ||
    fixtureIntent.wrapperRetryCount !== 0 ||
    fixtureResult.commandId !== 'PR12-CMD-008' ||
    fixtureResult.intentArtifactSha256 !==
      TYPES_DRIFT_CMD_FILE_SHA256['pr12-cmd-008-intent.json'] ||
    fixtureResult.dispatchCount !== 1 ||
    fixtureResult.wrapperRetryCount !== 0 ||
    fixtureResult.outcome !== 'SUCCEEDED' ||
    fixtureResult.timedOut !== false
  ) {
    fail(code);
  }

  const linkWithoutHash = {
    status: 'POST_FIXTURE_TYPES_DRIFT_VERIFIED',
    gitHead: TYPES_DRIFT_RECOVERY_HEAD,
    reasonCode: 'GENERATED_TYPES_DRIFT',
    completedCanonicalSteps: ['01', '02', '03'],
    blockedCanonicalStep: '04',
    step01FileSha256: TYPES_DRIFT_STEP_FILE_SHA256[STEP01_EVIDENCE_FILE],
    step01EvidenceSha256: TYPES_DRIFT_EVIDENCE_SHA256[STEP01_EVIDENCE_FILE],
    step02FileSha256: TYPES_DRIFT_STEP_FILE_SHA256[STEP02_EVIDENCE_FILE],
    step02EvidenceSha256: TYPES_DRIFT_EVIDENCE_SHA256[STEP02_EVIDENCE_FILE],
    step03FileSha256: TYPES_DRIFT_STEP_FILE_SHA256[STEP03_EVIDENCE_FILE],
    step03EvidenceSha256: TYPES_DRIFT_EVIDENCE_SHA256[STEP03_EVIDENCE_FILE],
    step04FileSha256: TYPES_DRIFT_STEP_FILE_SHA256[STEP04_EVIDENCE_FILE],
    step04EvidenceSha256: TYPES_DRIFT_EVIDENCE_SHA256[STEP04_EVIDENCE_FILE],
    executionBindingSha256: TYPES_DRIFT_EXECUTION_BINDING_SHA256,
    migrationApplyDispatchCount: 1,
    migrationApplyRedispatchAllowed: false,
    migrationApplyRedispatched: false,
    representativeFixtureDispatchCount: 1,
    representativeFixtureRedispatchAllowed: false,
    representativeFixtureRedispatched: false,
    verifiedRecoveryChain,
    newProjectPostAttemptCount: 0,
    productionContactCount: 0,
    rawPathsRetained: false,
    secretValuesCaptured: false,
  };
  return {
    link: {
      ...linkWithoutHash,
      linkSha256: sha256Canonical(linkWithoutHash),
    },
    sourceDirectory: evidence,
    step02,
  };
}

function assertPredecessorTypesNormalizationDefect(
  repositoryRoot,
  paths,
  predecessorAttempts
) {
  const code = 'TYPES_NORMALIZATION_DEFECT_EVIDENCE_INVALID';
  const journal = resolveExistingDirectory(
    paths.normalizationDefectRecoveryJournal,
    code
  );
  const evidence = resolveExistingDirectory(
    paths.normalizationDefectRecoveryEvidence,
    code
  );
  const workdir = resolveExistingDirectory(
    paths.normalizationDefectReplayWorkdir,
    code
  );
  const typesRuntime = resolveExistingDirectory(
    path.join(workdir, '.pr12-types-runtime'),
    code
  );
  const supabaseHome = resolveExistingDirectory(
    path.join(typesRuntime, 'supabase-home'),
    code
  );
  const dockerConfig = resolveExistingDirectory(
    path.join(typesRuntime, 'docker-config'),
    code
  );
  const supabaseRuntime = resolveExistingDirectory(
    path.join(workdir, 'supabase'),
    code
  );
  const supabaseTemp = resolveExistingDirectory(
    path.join(supabaseRuntime, '.temp'),
    code
  );
  const telemetryPath = resolveExistingFile(
    path.join(supabaseHome, 'telemetry.json'),
    code
  );
  const linkedProjectPath = resolveExistingFile(
    path.join(supabaseTemp, 'linked-project.json'),
    code
  );
  assertExactDirectoryEntries(
    journal,
    [
      'generated-types-diagnostic.json',
      'pr12-cycle6-database-identity.json',
      RUNTIME_CREDENTIAL_CONFIG_FILE,
      'pr12-existing-project-recovery-credential-consumed.json',
      TERMINAL_FILE,
      CLAIM_FILE,
    ],
    code
  );
  assertExactDirectoryEntries(
    evidence,
    [...Object.keys(NORMALIZATION_DEFECT_STEP_FILE_SHA256), CA_FILE],
    code
  );
  assertExactDirectoryEntries(
    workdir,
    ['.pr12-types-runtime', 'supabase'],
    code
  );
  assertExactDirectoryEntries(
    typesRuntime,
    ['docker-config', 'generated-types-hosted.ts', 'supabase-home'],
    code
  );
  assertExactDirectoryEntries(supabaseHome, ['telemetry.json'], code);
  assertExactDirectoryEntries(dockerConfig, [], code);
  assertExactDirectoryEntries(supabaseRuntime, ['.temp'], code);
  assertExactDirectoryEntries(supabaseTemp, ['linked-project.json'], code);
  for (const candidate of [
    typesRuntime,
    supabaseHome,
    dockerConfig,
    supabaseRuntime,
    supabaseTemp,
    telemetryPath,
    linkedProjectPath,
  ]) {
    assertNoReparsePathIdentity(workdir, candidate, code);
  }
  for (const directory of [journal, evidence, workdir]) {
    captureOwnerPrivatePath(repositoryRoot, directory, 'DIRECTORY');
  }
  for (const directory of [
    typesRuntime,
    supabaseHome,
    dockerConfig,
    supabaseRuntime,
    supabaseTemp,
  ]) {
    captureInheritedOwnerPrivatePath(repositoryRoot, directory, 'DIRECTORY');
  }
  for (const filename of [telemetryPath, linkedProjectPath]) {
    captureInheritedOwnerPrivatePath(repositoryRoot, filename, 'FILE');
  }

  const files = {
    runtimeCredential: path.join(journal, RUNTIME_CREDENTIAL_CONFIG_FILE),
    claim: path.join(journal, CLAIM_FILE),
    consumed: path.join(
      journal,
      'pr12-existing-project-recovery-credential-consumed.json'
    ),
    terminal: path.join(journal, TERMINAL_FILE),
    identity: path.join(journal, 'pr12-cycle6-database-identity.json'),
    diagnostic: path.join(journal, 'generated-types-diagnostic.json'),
    ca: path.join(evidence, CA_FILE),
    generatedTypes: path.join(typesRuntime, 'generated-types-hosted.ts'),
  };
  const evidenceFiles = Object.fromEntries(
    Object.keys(NORMALIZATION_DEFECT_STEP_FILE_SHA256).map(filename => [
      filename,
      path.join(evidence, filename),
    ])
  );
  for (const filename of [
    ...Object.values(files),
    ...Object.values(evidenceFiles),
  ]) {
    resolveExistingFile(filename, code);
    captureOwnerPrivatePath(repositoryRoot, filename, 'FILE');
  }

  const runtimeCredential = readCanonicalJson(files.runtimeCredential, code);
  const claim = readCanonicalJson(files.claim, code);
  const consumed = readCanonicalJson(files.consumed, code);
  const terminal = readCanonicalJson(files.terminal, code);
  const identity = readCanonicalJson(files.identity, code);
  const diagnostic = readCanonicalJson(files.diagnostic, code);
  const steps = Object.fromEntries(
    Object.entries(evidenceFiles).map(([filename, artifactPath]) => [
      filename,
      readCanonicalJson(artifactPath, code),
    ])
  );
  if (
    runtimeCredential.sha256 !==
      NORMALIZATION_DEFECT_RUNTIME_CREDENTIAL_FILE_SHA256 ||
    claim.sha256 !== NORMALIZATION_DEFECT_CLAIM_FILE_SHA256 ||
    consumed.sha256 !== NORMALIZATION_DEFECT_CONSUMED_FILE_SHA256 ||
    terminal.sha256 !== NORMALIZATION_DEFECT_TERMINAL_FILE_SHA256 ||
    identity.sha256 !== NORMALIZATION_DEFECT_DATABASE_IDENTITY_FILE_SHA256 ||
    diagnostic.sha256 !== NORMALIZATION_DEFECT_DIAGNOSTIC_FILE_SHA256 ||
    sha256Bytes(readFileSync(files.ca)) !== PINNED_CA_SHA256 ||
    sha256Bytes(readFileSync(files.generatedTypes)) !==
      NORMALIZATION_DEFECT_GENERATED_TYPES_SHA256 ||
    statSync(files.generatedTypes).size !==
      NORMALIZATION_DEFECT_GENERATED_TYPES_BYTES ||
    sha256StableFile(telemetryPath, 1024, code) !==
      NORMALIZATION_DEFECT_TELEMETRY_FILE_SHA256 ||
    sha256StableFile(linkedProjectPath, 1024, code) !==
      NORMALIZATION_DEFECT_LINKED_PROJECT_FILE_SHA256 ||
    Object.entries(steps).some(
      ([filename, snapshot]) =>
        snapshot.sha256 !== NORMALIZATION_DEFECT_STEP_FILE_SHA256[filename]
    )
  ) {
    fail(code);
  }
  assertCanonicalEmbeddedSha(
    terminal.value,
    'terminalSha256',
    NORMALIZATION_DEFECT_TERMINAL_SHA256,
    code
  );
  assertCanonicalEmbeddedSha(
    identity.value,
    'identityEvidenceSha256',
    NORMALIZATION_DEFECT_DATABASE_IDENTITY_SHA256,
    code
  );
  assertCanonicalEmbeddedSha(
    diagnostic.value,
    'diagnosticArtifactSha256',
    NORMALIZATION_DEFECT_DIAGNOSTIC_SHA256,
    code
  );
  for (const [filename, snapshot] of Object.entries(steps)) {
    assertCanonicalEmbeddedSha(
      snapshot.value,
      'evidenceSha256',
      NORMALIZATION_DEFECT_EVIDENCE_SHA256[filename],
      code
    );
  }
  const step01 = steps[STEP01_EVIDENCE_FILE].value;
  const step02 = steps[STEP02_EVIDENCE_FILE].value;
  const step03 = steps[STEP03_EVIDENCE_FILE].value;
  const step04 = steps[STEP04_EVIDENCE_FILE].value;
  const lastAttempt = predecessorAttempts.at(-1);
  if (
    claim.value.actionId !== RECOVERY_ACTION_ID ||
    claim.value.state !== 'CLAIMED_CONTINUATION_NOT_STARTED' ||
    claim.value.bindingMaterialSha256 !==
      NORMALIZATION_DEFECT_BINDING_MATERIAL_SHA256 ||
    claim.value.derivedExecutionBindingSha256 !==
      NORMALIZATION_DEFECT_EXECUTION_BINDING_SHA256 ||
    claim.value.payloadSha256 !== NORMALIZATION_DEFECT_PAYLOAD_SHA256 ||
    consumed.value.actionId !== RECOVERY_ACTION_ID ||
    consumed.value.state !== 'CREDENTIAL_CONSUMED_CONTINUATION_STARTED' ||
    consumed.value.claimSha256 !== NORMALIZATION_DEFECT_CLAIM_FILE_SHA256 ||
    terminal.value.gitHead !== NORMALIZATION_DEFECT_RECOVERY_HEAD ||
    terminal.value.status !== 'BLOCK' ||
    terminal.value.reasonCode !== 'GENERATED_TYPES_DRIFT' ||
    canonicalJson(terminal.value.completedCanonicalSteps) !==
      canonicalJson(['01', '02', '03']) ||
    terminal.value.blockedCanonicalStep !== '04' ||
    canonicalJson(terminal.value.predecessorAttempts) !==
      canonicalJson(predecessorAttempts) ||
    terminal.value.newProjectPostAttemptCount !== 0 ||
    terminal.value.productionContactCount !== 0 ||
    step01.status !== 'PASS' ||
    step01.decision?.result !== 'PASS' ||
    step01.database?.systemIdentifier !== '7666052913346410626' ||
    step02.status !== 'PASS' ||
    step02.postApplyRecovery?.migrationApplyRedispatched !== false ||
    step03.status !== 'PASS' ||
    step03.explicitRows !== 83 ||
    step03.derivedRows !== 12 ||
    step03.verifiedRows !== 95 ||
    step04.status !== 'BLOCK' ||
    step04.reasonCode !== 'GENERATED_TYPES_DRIFT' ||
    step04.dispatch?.dispatchCount !== 1 ||
    step04.dispatch?.wrapperRetryCount !== 0 ||
    step04.dispatch?.exitCode !== 0 ||
    step04.generatedTypesArtifact?.artifactSha256 !==
      NORMALIZATION_DEFECT_GENERATED_TYPES_SHA256 ||
    step04.generatedTypesArtifact?.byteLength !==
      NORMALIZATION_DEFECT_GENERATED_TYPES_BYTES ||
    step04.diagnostic?.artifactSha256 !==
      NORMALIZATION_DEFECT_DIAGNOSTIC_SHA256 ||
    step04.diagnostic?.fileSha256 !==
      NORMALIZATION_DEFECT_DIAGNOSTIC_FILE_SHA256 ||
    step04.managementCredentialPassedViaChildEnvironmentOnly !== true ||
    step04.productionContactCount !== 0 ||
    identity.value.projectRef !== PR12_RECOVERY_TARGET.projectRef ||
    identity.value.database?.status !== 'REACHABLE' ||
    identity.value.database?.systemIdentifier !== '7666052913346410626' ||
    identity.value.database?.tls?.verifiedMode !== 'verify-full' ||
    identity.value.predecessorTypesDriftLinkSha256 !==
      lastAttempt?.linkSha256 ||
    identity.value.productionBoundary?.productionCredentialAccessCount !== 0 ||
    identity.value.productionBoundary?.productionDatabaseContactCount !== 0 ||
    diagnostic.value.gitHead !== NORMALIZATION_DEFECT_RECOVERY_HEAD ||
    diagnostic.value.bindingSha256 !==
      NORMALIZATION_DEFECT_EXECUTION_BINDING_SHA256 ||
    diagnostic.value.projectRef !== PR12_RECOVERY_TARGET.projectRef ||
    diagnostic.value.databaseSystemIdentifier !== '7666052913346410626' ||
    diagnostic.value.diagnostic?.status !== 'GENERATED_TYPES_DRIFT' ||
    diagnostic.value.generatedTypesArtifact?.artifactSha256 !==
      NORMALIZATION_DEFECT_GENERATED_TYPES_SHA256 ||
    diagnostic.value.generatedTypesArtifact?.byteLength !==
      NORMALIZATION_DEFECT_GENERATED_TYPES_BYTES ||
    diagnostic.value.generatedTypesArtifact?.pathFingerprint !==
      windowsPathFingerprint(files.generatedTypes) ||
    diagnostic.value.committedFileMutated !== false ||
    diagnostic.value.secretValuesCaptured !== false
  ) {
    fail(code);
  }

  const linkWithoutHash = {
    status: 'GENERATED_TYPES_NORMALIZATION_RECHECK_PENDING',
    gitHead: NORMALIZATION_DEFECT_RECOVERY_HEAD,
    historicalReasonCode: 'GENERATED_TYPES_DRIFT',
    suspectedClassification: 'LOCAL_FORMAT_NORMALIZATION_DEFECT',
    completedCanonicalSteps: ['01', '02', '03'],
    blockedCanonicalStep: '04',
    step01FileSha256:
      NORMALIZATION_DEFECT_STEP_FILE_SHA256[STEP01_EVIDENCE_FILE],
    step01EvidenceSha256:
      NORMALIZATION_DEFECT_EVIDENCE_SHA256[STEP01_EVIDENCE_FILE],
    step02FileSha256:
      NORMALIZATION_DEFECT_STEP_FILE_SHA256[STEP02_EVIDENCE_FILE],
    step02EvidenceSha256:
      NORMALIZATION_DEFECT_EVIDENCE_SHA256[STEP02_EVIDENCE_FILE],
    step03FileSha256:
      NORMALIZATION_DEFECT_STEP_FILE_SHA256[STEP03_EVIDENCE_FILE],
    step03EvidenceSha256:
      NORMALIZATION_DEFECT_EVIDENCE_SHA256[STEP03_EVIDENCE_FILE],
    step04FileSha256:
      NORMALIZATION_DEFECT_STEP_FILE_SHA256[STEP04_EVIDENCE_FILE],
    step04EvidenceSha256:
      NORMALIZATION_DEFECT_EVIDENCE_SHA256[STEP04_EVIDENCE_FILE],
    diagnosticFileSha256: NORMALIZATION_DEFECT_DIAGNOSTIC_FILE_SHA256,
    diagnosticArtifactSha256: NORMALIZATION_DEFECT_DIAGNOSTIC_SHA256,
    generatedTypesArtifactSha256: NORMALIZATION_DEFECT_GENERATED_TYPES_SHA256,
    hostedTypesGenerationDispatchCount: 1,
    hostedTypesRemoteRedispatchAllowed: false,
    hostedTypesRemoteRedispatched: false,
    historicalRuntimeResidue: {
      authority: 'NON_EVIDENCE_NON_INPUT',
      exactTreeVerified: true,
      reparseComponentCount: 0,
      effectiveAcl:
        'INHERITED_CURRENT_USER_AND_SYSTEM_FULL_CONTROL_FROM_PROTECTED_ROOT',
      telemetryFileSha256: NORMALIZATION_DEFECT_TELEMETRY_FILE_SHA256,
      linkedProjectFileSha256: NORMALIZATION_DEFECT_LINKED_PROJECT_FILE_SHA256,
      contentConsumedByCycle7: false,
      credentialConsumedByCycle7: false,
    },
    migrationApplyRedispatched: false,
    representativeFixtureRedispatched: false,
    newProjectPostAttemptCount: 0,
    productionContactCount: 0,
    secretValuesCaptured: false,
  };
  return {
    link: {
      ...linkWithoutHash,
      linkSha256: sha256Canonical(linkWithoutHash),
    },
    sourceDirectory: evidence,
    generatedTypesPath: files.generatedTypes,
    step02,
  };
}

function assertPredecessorAdvisorShapeDefect(
  repositoryRoot,
  paths,
  predecessorAttempts
) {
  let code = 'ADVISOR_SHAPE_DEFECT_PATH_SET_INVALID';
  const journal = resolveExistingDirectory(
    paths.advisorShapeDefectRecoveryJournal,
    code
  );
  const evidence = resolveExistingDirectory(
    paths.advisorShapeDefectRecoveryEvidence,
    code
  );
  const workdir = resolveExistingDirectory(
    paths.advisorShapeDefectReplayWorkdir,
    code
  );
  const runtime = resolveExistingDirectory(
    path.join(workdir, '.pr12-runtime'),
    code
  );
  const supabaseHome = resolveExistingDirectory(
    path.join(runtime, 'supabase-home'),
    code
  );
  const typesRuntime = resolveExistingDirectory(
    path.join(workdir, '.pr12-types-runtime'),
    code
  );
  const formatterRuntime = resolveExistingDirectory(
    path.join(typesRuntime, 'formatter-runtime'),
    code
  );
  const prettierRoot = resolveExistingDirectory(
    path.join(formatterRuntime, 'prettier'),
    code
  );
  const telemetryPath = resolveExistingFile(
    path.join(supabaseHome, 'telemetry.json'),
    code
  );
  const generatedTypesPath = resolveExistingFile(
    path.join(typesRuntime, 'generated-types-hosted.ts'),
    code
  );
  const formatterConfigPath = resolveExistingFile(
    path.join(formatterRuntime, '.prettierrc'),
    code
  );
  assertExactDirectoryEntries(
    journal,
    [
      'generated-types-normalization-recovery.json',
      'pr12-cmd-016-intent.json',
      'pr12-cmd-016-result.json',
      'pr12-cycle7-database-identity.json',
      RUNTIME_CREDENTIAL_CONFIG_FILE,
      'pr12-existing-project-recovery-credential-consumed.json',
      TERMINAL_FILE,
      CLAIM_FILE,
    ],
    code
  );
  assertExactDirectoryEntries(
    evidence,
    [...Object.keys(ADVISOR_SHAPE_DEFECT_STEP_FILE_SHA256), CA_FILE],
    code
  );
  assertExactDirectoryEntries(
    workdir,
    ['.pr12-runtime', '.pr12-types-runtime'],
    code
  );
  assertExactDirectoryEntries(runtime, ['supabase-home'], code);
  assertExactDirectoryEntries(supabaseHome, ['telemetry.json'], code);
  assertExactDirectoryEntries(
    typesRuntime,
    ['formatter-runtime', 'generated-types-hosted.ts'],
    code
  );
  assertExactDirectoryEntries(
    formatterRuntime,
    ['.prettierrc', 'prettier'],
    code
  );
  code = 'ADVISOR_SHAPE_DEFECT_DIRECTORY_SECURITY_INVALID';
  for (const directory of [journal, evidence, workdir]) {
    captureOwnerPrivatePath(repositoryRoot, directory, 'DIRECTORY');
  }
  const protectedCycle7Candidates = [
    typesRuntime,
    formatterRuntime,
    generatedTypesPath,
  ];
  const inheritedCycle7Candidates = [
    runtime,
    supabaseHome,
    prettierRoot,
    telemetryPath,
    formatterConfigPath,
  ];
  for (const candidate of [
    ...protectedCycle7Candidates,
    ...inheritedCycle7Candidates,
  ]) {
    assertNoReparsePathIdentity(workdir, candidate, code);
  }
  for (const candidate of protectedCycle7Candidates) {
    captureOwnerPrivatePath(
      repositoryRoot,
      candidate,
      statSync(candidate).isDirectory() ? 'DIRECTORY' : 'FILE'
    );
  }
  for (const candidate of inheritedCycle7Candidates) {
    captureInheritedOwnerPrivatePath(
      repositoryRoot,
      candidate,
      statSync(candidate).isDirectory() ? 'DIRECTORY' : 'FILE'
    );
  }
  const pinnedPrettierRuntime = verifyPinnedPrettierRuntime({
    prettierRoot,
    prettierConfigPath: formatterConfigPath,
  });

  const files = {
    runtimeCredential: path.join(journal, RUNTIME_CREDENTIAL_CONFIG_FILE),
    claim: path.join(journal, CLAIM_FILE),
    consumed: path.join(
      journal,
      'pr12-existing-project-recovery-credential-consumed.json'
    ),
    terminal: path.join(journal, TERMINAL_FILE),
    identity: path.join(journal, 'pr12-cycle7-database-identity.json'),
    normalization: path.join(
      journal,
      'generated-types-normalization-recovery.json'
    ),
    cmd016Intent: path.join(journal, 'pr12-cmd-016-intent.json'),
    cmd016Result: path.join(journal, 'pr12-cmd-016-result.json'),
  };
  const evidenceFiles = Object.fromEntries(
    Object.keys(ADVISOR_SHAPE_DEFECT_STEP_FILE_SHA256).map(filename => [
      filename,
      path.join(evidence, filename),
    ])
  );
  code = 'ADVISOR_SHAPE_DEFECT_FILE_SECURITY_INVALID';
  const actionBase = path.dirname(journal);
  for (const candidate of [
    ...Object.values(files),
    ...Object.values(evidenceFiles),
    path.join(evidence, CA_FILE),
  ]) {
    assertNoReparsePathIdentity(actionBase, candidate, code);
    captureOwnerPrivatePath(repositoryRoot, candidate, 'FILE');
  }
  const snapshots = Object.fromEntries(
    Object.entries(files).map(([name, filename]) => [
      name,
      readCanonicalJson(filename, code),
    ])
  );
  const evidenceSnapshots = Object.fromEntries(
    Object.entries(evidenceFiles).map(([filename, artifactPath]) => [
      filename,
      readCanonicalJson(artifactPath, code),
    ])
  );
  code = 'ADVISOR_SHAPE_DEFECT_FILE_HASH_INVALID';
  if (
    snapshots.runtimeCredential.sha256 !==
      ADVISOR_SHAPE_DEFECT_RUNTIME_CREDENTIAL_FILE_SHA256 ||
    snapshots.claim.sha256 !== ADVISOR_SHAPE_DEFECT_CLAIM_FILE_SHA256 ||
    snapshots.consumed.sha256 !== ADVISOR_SHAPE_DEFECT_CONSUMED_FILE_SHA256 ||
    snapshots.terminal.sha256 !== ADVISOR_SHAPE_DEFECT_TERMINAL_FILE_SHA256 ||
    snapshots.identity.sha256 !==
      ADVISOR_SHAPE_DEFECT_DATABASE_IDENTITY_FILE_SHA256 ||
    snapshots.normalization.sha256 !==
      ADVISOR_SHAPE_DEFECT_NORMALIZATION_FILE_SHA256 ||
    snapshots.cmd016Intent.sha256 !==
      ADVISOR_SHAPE_DEFECT_CMD016_INTENT_FILE_SHA256 ||
    snapshots.cmd016Result.sha256 !==
      ADVISOR_SHAPE_DEFECT_CMD016_RESULT_FILE_SHA256 ||
    Object.entries(evidenceSnapshots).some(
      ([filename, snapshot]) =>
        snapshot.sha256 !== ADVISOR_SHAPE_DEFECT_STEP_FILE_SHA256[filename]
    )
  ) {
    fail(code);
  }
  code = 'ADVISOR_SHAPE_DEFECT_EMBEDDED_HASH_INVALID';
  assertCanonicalEmbeddedSha(
    snapshots.terminal.value,
    'terminalSha256',
    ADVISOR_SHAPE_DEFECT_TERMINAL_SHA256,
    code
  );
  assertCanonicalEmbeddedSha(
    snapshots.identity.value,
    'identityEvidenceSha256',
    ADVISOR_SHAPE_DEFECT_DATABASE_IDENTITY_SHA256,
    code
  );
  assertCanonicalEmbeddedSha(
    snapshots.normalization.value,
    'normalizationArtifactSha256',
    ADVISOR_SHAPE_DEFECT_NORMALIZATION_SHA256,
    code
  );
  assertCanonicalEmbeddedSha(
    snapshots.cmd016Intent.value,
    'intentSha256',
    ADVISOR_SHAPE_DEFECT_CMD016_INTENT_SHA256,
    code
  );
  assertCanonicalEmbeddedSha(
    snapshots.cmd016Result.value,
    'observationSha256',
    ADVISOR_SHAPE_DEFECT_CMD016_OBSERVATION_SHA256,
    code
  );
  for (const [filename, snapshot] of Object.entries(evidenceSnapshots)) {
    assertCanonicalEmbeddedSha(
      snapshot.value,
      'evidenceSha256',
      ADVISOR_SHAPE_DEFECT_EVIDENCE_SHA256[filename],
      code
    );
  }

  const claim = snapshots.claim.value;
  const consumed = snapshots.consumed.value;
  const terminal = snapshots.terminal.value;
  const identity = snapshots.identity.value;
  const normalization = snapshots.normalization.value;
  const intent = snapshots.cmd016Intent.value;
  const result = snapshots.cmd016Result.value;
  const step01 = evidenceSnapshots[STEP01_EVIDENCE_FILE].value;
  const step02 = evidenceSnapshots[STEP02_EVIDENCE_FILE].value;
  const step03 = evidenceSnapshots[STEP03_EVIDENCE_FILE].value;
  const step04 = evidenceSnapshots[STEP04_EVIDENCE_FILE].value;
  const step05 = evidenceSnapshots[STEP05_EVIDENCE_FILE].value;
  const chronologyCode = 'ADVISOR_SHAPE_DEFECT_CHRONOLOGY_INVALID';
  const claimClaimedAt = parseCanonicalUtcTimestamp(
    claim.claimedAt,
    chronologyCode
  );
  const consumedAt = parseCanonicalUtcTimestamp(
    consumed.consumedAt,
    chronologyCode
  );
  const databaseObservedAt = parseCanonicalUtcTimestamp(
    identity.database?.databaseUtc,
    chronologyCode
  );
  const step04StartedAt = parseCanonicalUtcTimestamp(
    step04.startedAt,
    chronologyCode
  );
  const step04CompletedAt = parseCanonicalUtcTimestamp(
    step04.completedAt,
    chronologyCode
  );
  const intentCreatedAt = parseCanonicalUtcTimestamp(
    intent.createdAt,
    chronologyCode
  );
  const resultStartedAt = parseCanonicalUtcTimestamp(
    result.startedAt,
    chronologyCode
  );
  const resultCompletedAt = parseCanonicalUtcTimestamp(
    result.completedAt,
    chronologyCode
  );
  const step05CompletedAt = parseCanonicalUtcTimestamp(
    step05.completedAt,
    chronologyCode
  );
  const terminalCompletedAt = parseCanonicalUtcTimestamp(
    terminal.completedAt,
    chronologyCode
  );
  if (
    !(
      claimClaimedAt < consumedAt &&
      consumedAt < databaseObservedAt &&
      databaseObservedAt < step04StartedAt &&
      step04StartedAt < step04CompletedAt &&
      step04CompletedAt < intentCreatedAt &&
      intentCreatedAt === resultStartedAt &&
      resultStartedAt < resultCompletedAt &&
      resultCompletedAt < step05CompletedAt &&
      step05CompletedAt < terminalCompletedAt
    )
  ) {
    fail(chronologyCode);
  }
  if (
    claim.actionId !== RECOVERY_ACTION_ID ||
    claim.bindingMaterialSha256 !==
      ADVISOR_SHAPE_DEFECT_BINDING_MATERIAL_SHA256 ||
    claim.derivedExecutionBindingSha256 !==
      ADVISOR_SHAPE_DEFECT_EXECUTION_BINDING_SHA256 ||
    claim.payloadSha256 !== ADVISOR_SHAPE_DEFECT_PAYLOAD_SHA256 ||
    consumed.actionId !== RECOVERY_ACTION_ID ||
    consumed.claimSha256 !== ADVISOR_SHAPE_DEFECT_CLAIM_FILE_SHA256
  ) {
    fail('ADVISOR_SHAPE_DEFECT_CLAIM_CONTENT_INVALID');
  }
  if (
    terminal.gitHead !== ADVISOR_SHAPE_DEFECT_RECOVERY_HEAD ||
    terminal.status !== 'BLOCK' ||
    terminal.reasonCode !== 'ADVISOR_FINDING_SHAPE_INVALID' ||
    terminal.blockedCanonicalStep !== '05' ||
    JSON.stringify(terminal.completedCanonicalSteps) !==
      JSON.stringify(['01', '02', '03', '04']) ||
    canonicalJson(terminal.predecessorAttempts) !==
      canonicalJson(predecessorAttempts) ||
    terminal.newProjectPostAttemptCount !== 0 ||
    terminal.productionContactCount !== 0
  ) {
    fail('ADVISOR_SHAPE_DEFECT_TERMINAL_CHAIN_INVALID');
  }
  if (
    identity.projectRef !== PR12_RECOVERY_TARGET.projectRef ||
    identity.database?.status !== 'REACHABLE' ||
    identity.database?.connectionMode !== 'DIRECT' ||
    identity.database?.systemIdentifier !== '7666052913346410626' ||
    identity.database?.tls?.verifiedMode !== 'verify-full'
  ) {
    fail('ADVISOR_SHAPE_DEFECT_DATABASE_IDENTITY_INVALID');
  }
  if (
    normalization.recordType !== 'PR12_HOSTED_TYPES_NORMALIZATION_RECOVERY' ||
    normalization.comparison?.status !== 'GENERATED_TYPES_PARITY' ||
    normalization.comparison?.parity !== true ||
    normalization.gitHead !== ADVISOR_SHAPE_DEFECT_RECOVERY_HEAD ||
    normalization.bindingSha256 !==
      ADVISOR_SHAPE_DEFECT_EXECUTION_BINDING_SHA256 ||
    normalization.hostedTypesRemoteRedispatched !== false ||
    normalization.formatter?.prettierPackageTreeSha256 !==
      pinnedPrettierRuntime.treeSha256 ||
    normalization.formatter?.prettierPackageFileCount !==
      pinnedPrettierRuntime.fileCount ||
    normalization.formatter?.prettierPackageTotalBytes !==
      pinnedPrettierRuntime.totalBytes ||
    normalization.formatter?.prettierConfigSha256 !==
      pinnedPrettierRuntime.configSha256
  ) {
    fail('ADVISOR_SHAPE_DEFECT_NORMALIZATION_CONTENT_INVALID');
  }
  if (
    intent.commandId !== 'PR12-CMD-016' ||
    intent.mutation !== false ||
    intent.dispatchMaximum !== 1 ||
    intent.wrapperRetryCount !== 0 ||
    result.commandId !== 'PR12-CMD-016' ||
    result.dispatchCount !== 1 ||
    result.wrapperRetryCount !== 0 ||
    result.outcome !== 'SUCCEEDED' ||
    result.timedOut !== false ||
    result.rawOutputRetained !== false ||
    result.intentArtifactSha256 !==
      ADVISOR_SHAPE_DEFECT_CMD016_INTENT_FILE_SHA256
  ) {
    fail('ADVISOR_SHAPE_DEFECT_CMD016_CONTENT_INVALID');
  }
  if (
    step01.status !== 'PASS' ||
    step02.status !== 'PASS' ||
    step03.status !== 'PASS' ||
    step04.status !== 'PASS' ||
    step04.hostedTypesRemoteRedispatched !== false ||
    step05.status !== 'BLOCK' ||
    step05.reasonCode !== 'ADVISOR_FINDING_SHAPE_INVALID' ||
    step05.rawOutputsRetained !== false ||
    step05.productionContactCount !== 0
  ) {
    fail('ADVISOR_SHAPE_DEFECT_STEP_STATE_INVALID');
  }
  for (const [name, snapshot] of Object.entries(snapshots)) {
    if (name === 'runtimeCredential') continue;
    assertSecretFreeEvidence(snapshot.value, []);
  }
  for (const snapshot of Object.values(evidenceSnapshots)) {
    assertSecretFreeEvidence(snapshot.value, []);
  }
  code = 'ADVISOR_SHAPE_DEFECT_BYTE_HASH_INVALID';
  const caBytes = readStableBytes(
    path.join(evidence, CA_FILE),
    16 * 1024,
    code
  );
  const generatedTypesBytes = readStableBytes(
    generatedTypesPath,
    512 * 1024,
    code
  );
  const telemetryBytes = readStableBytes(telemetryPath, 64 * 1024, code);
  try {
    if (
      sha256Bytes(caBytes) !== PINNED_CA_SHA256 ||
      sha256Bytes(generatedTypesBytes) !==
        NORMALIZATION_DEFECT_GENERATED_TYPES_SHA256 ||
      sha256Bytes(telemetryBytes) !== ADVISOR_SHAPE_DEFECT_TELEMETRY_FILE_SHA256
    ) {
      fail(code);
    }
  } finally {
    caBytes.fill(0);
    generatedTypesBytes.fill(0);
    telemetryBytes.fill(0);
  }

  const linkWithoutHash = {
    status: 'POST_TYPES_ADVISOR_SHAPE_TOOLING_DEFECT_VERIFIED',
    gitHead: ADVISOR_SHAPE_DEFECT_RECOVERY_HEAD,
    completedCanonicalSteps: ['01', '02', '03', '04'],
    blockedCanonicalStep: '05',
    reasonCode: 'ADVISOR_FINDING_SHAPE_INVALID',
    executionBindingSha256: ADVISOR_SHAPE_DEFECT_EXECUTION_BINDING_SHA256,
    step01FileSha256:
      ADVISOR_SHAPE_DEFECT_STEP_FILE_SHA256[STEP01_EVIDENCE_FILE],
    step01EvidenceSha256:
      ADVISOR_SHAPE_DEFECT_EVIDENCE_SHA256[STEP01_EVIDENCE_FILE],
    step02FileSha256:
      ADVISOR_SHAPE_DEFECT_STEP_FILE_SHA256[STEP02_EVIDENCE_FILE],
    step02EvidenceSha256:
      ADVISOR_SHAPE_DEFECT_EVIDENCE_SHA256[STEP02_EVIDENCE_FILE],
    step03FileSha256:
      ADVISOR_SHAPE_DEFECT_STEP_FILE_SHA256[STEP03_EVIDENCE_FILE],
    step03EvidenceSha256:
      ADVISOR_SHAPE_DEFECT_EVIDENCE_SHA256[STEP03_EVIDENCE_FILE],
    step04FileSha256:
      ADVISOR_SHAPE_DEFECT_STEP_FILE_SHA256[STEP04_EVIDENCE_FILE],
    step04EvidenceSha256:
      ADVISOR_SHAPE_DEFECT_EVIDENCE_SHA256[STEP04_EVIDENCE_FILE],
    step05FileSha256:
      ADVISOR_SHAPE_DEFECT_STEP_FILE_SHA256[STEP05_EVIDENCE_FILE],
    step05EvidenceSha256:
      ADVISOR_SHAPE_DEFECT_EVIDENCE_SHA256[STEP05_EVIDENCE_FILE],
    advisorScanHistoricalDispatchCount: 1,
    advisorScanHistoricalMutationCount: 0,
    advisorScanReadOnlyRedispatchMaximum: 1,
    migrationApplyRedispatched: false,
    representativeFixtureRedispatched: false,
    hostedTypesRemoteRedispatched: false,
    newProjectPostAttemptCount: 0,
    productionContactCount: 0,
    rawAdvisorOutputRetained: false,
    secretValuesCaptured: false,
  };
  return {
    link: {
      ...linkWithoutHash,
      linkSha256: sha256Canonical(linkWithoutHash),
    },
    sourceDirectory: evidence,
    step02,
  };
}

function createOwnerPrivateDirectory(repositoryRoot, directory) {
  if (existsSync(directory)) fail('RECOVERY_OUTPUT_ALREADY_EXISTS');
  mkdirSync(directory, { recursive: false });
  return hardenPath(repositoryRoot, directory, 'DIRECTORY');
}

function copyExactCanonicalArtifact({
  repositoryRoot,
  source,
  destination,
  expectedSha256,
  code,
}) {
  const snapshot = readCanonicalJson(source, code);
  if (snapshot.sha256 !== expectedSha256) fail(code);
  const writtenSha256 = writeCanonicalCreateNew(
    destination,
    snapshot.value,
    code
  );
  if (writtenSha256 !== expectedSha256) fail(code);
  hardenPath(repositoryRoot, destination, 'FILE');
  return snapshot.value;
}

function copyExactBytesArtifact({
  repositoryRoot,
  source,
  destination,
  expectedSha256,
  maximumBytes,
  code,
}) {
  const bytes = readStableBytes(source, maximumBytes, code);
  try {
    if (sha256Bytes(bytes) !== expectedSha256) fail(code);
    const writtenSha256 = writeBytesCreateNew(destination, bytes, code);
    if (writtenSha256 !== expectedSha256) fail(code);
    hardenPath(repositoryRoot, destination, 'FILE');
  } finally {
    bytes.fill(0);
  }
}

function createRuntimeCredentialConfiguration(
  repositoryRoot,
  sourceSnapshot,
  recoveryJournal
) {
  const value = structuredClone(sourceSnapshot.value);
  if (!isRecord(value.runtime)) fail('CREDENTIAL_CONFIG_INVALID');
  const brokerPath = path.join(
    repositoryRoot,
    'scripts/commercial-hardening/pr12-windows-dpapi-credential-broker.ps1'
  );
  value.runtime.brokerScriptSha256 = sha256Bytes(readFileSync(brokerPath));
  const outputPath = path.join(recoveryJournal, RUNTIME_CREDENTIAL_CONFIG_FILE);
  const sha256 = writeCanonicalCreateNew(
    outputPath,
    value,
    'RUNTIME_CREDENTIAL_CONFIG_CREATE_FAILED'
  );
  hardenPath(repositoryRoot, outputPath, 'FILE');
  return { value, sha256, outputPath, sourceSha256: sourceSnapshot.sha256 };
}

function createRecoveryClaim({
  repositoryRoot,
  journalDirectory,
  gitHead,
  action003Evidence,
  action003Verification,
  credentialConfigurationSha256,
  predecessorAttempts,
}) {
  const ownerDecision = {
    schemaVersion: 1,
    actionId: RECOVERY_ACTION_ID,
    target: {
      projectRef: PR12_RECOVERY_TARGET.projectRef,
      organizationId: PR12_RECOVERY_TARGET.organizationId,
      region: PR12_RECOVERY_TARGET.region,
    },
    scope: [
      'READ_ONLY_PROVIDER_PROJECT_STATE',
      'RUNTIME_ONLY_CREDENTIAL_RETRIEVAL',
      'ISOLATED_DATABASE_IDENTITY',
      'FULL_MIGRATION_REPLAY',
      'REPRESENTATIVE_DATA_VALIDATION',
      'GENERATED_TYPES_PARITY',
      'ADVISOR_SCAN',
      'ALL_ROLE_SMOKE',
    ],
    restrictions: {
      newProjectPostAllowed: false,
      productionContactAllowed: false,
      projectDeletionAllowed: false,
      externalSideEffectsAllowed: false,
    },
    gitHead,
    action003ManifestSha256: action003Verification.manifestSha256,
    action003EvidencePathSha256: windowsPathFingerprint(action003Evidence),
    credentialConfigurationSha256,
    predecessorAttempts,
  };
  const bindingMaterialSha256 = sha256Canonical(ownerDecision);
  const payloadSha256 = sha256Canonical({
    ownerDecision,
    ownerInstruction:
      'OWNER_DECISION_RECOVER_EXISTING_PR12_ISOLATED_PROJECT_AND_CONTINUE',
  });
  const derivedExecutionBindingSha256 = sha256Canonical({
    actionId: RECOVERY_ACTION_ID,
    bindingMaterialSha256,
    payloadSha256,
    journalDirectoryPathSha256: windowsPathFingerprint(journalDirectory),
  });
  const claim = {
    actionId: RECOVERY_ACTION_ID,
    bindingMaterialSha256,
    claimedAt: new Date().toISOString(),
    derivedExecutionBindingSha256,
    payloadSha256,
    state: 'CLAIMED_CONTINUATION_NOT_STARTED',
  };
  const claimPath = path.join(journalDirectory, CLAIM_FILE);
  const sha256 = writeCanonicalCreateNew(
    claimPath,
    claim,
    'RECOVERY_CLAIM_CREATE_FAILED'
  );
  hardenPath(repositoryRoot, claimPath, 'FILE');
  return { claim, sha256, ownerDecision };
}

function assertNoAmbientCredentials() {
  const forbidden = Object.keys(process.env)
    .filter(isForbiddenAmbientCredentialName)
    .sort();
  if (forbidden.length > 0) fail('AMBIENT_CREDENTIAL_ENVIRONMENT_FORBIDDEN');
}

function observeOwnerPrivatePath(repositoryRoot, targetPath, kind, mode) {
  const helper = path.join(
    repositoryRoot,
    'scripts/commercial-hardening/pr12-windows-owner-private-acl.ps1'
  );
  const powershell = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
  const result = spawnSync(
    powershell,
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-File',
      helper,
      '-Mode',
      mode,
      '-Kind',
      kind,
      '-LiteralPath',
      targetPath,
    ],
    {
      cwd: repositoryRoot,
      env: {
        SystemRoot: process.env.SystemRoot ?? 'C:\\Windows',
        TEMP: process.env.TEMP ?? 'C:\\Windows\\Temp',
        TMP: process.env.TMP ?? 'C:\\Windows\\Temp',
        PATH: path.dirname(powershell),
      },
      encoding: 'utf8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
      windowsHide: true,
    }
  );
  if (result.status !== 0 || result.error !== undefined) {
    fail('OWNER_PRIVATE_ACL_FAILED');
  }
  try {
    const observation = JSON.parse(result.stdout);
    const effectiveInherited = mode === 'CAPTURE_EFFECTIVE';
    if (
      observation.accessRulesProtected !== !effectiveInherited ||
      observation.accessRuleCount !== 2 ||
      observation.rulesInherited !== effectiveInherited ||
      observation.aclPolicyId !==
        (effectiveInherited
          ? 'WINDOWS_INHERITED_CURRENT_USER_AND_SYSTEM_FULL_CONTROL_V1'
          : 'WINDOWS_CURRENT_USER_AND_SYSTEM_FULL_CONTROL_V1')
    ) {
      fail('OWNER_PRIVATE_ACL_FAILED');
    }
    return {
      policy: observation.aclPolicyId,
      accessRulesProtected: !effectiveInherited,
      accessRuleCount: 2,
      rulesInherited: effectiveInherited,
    };
  } catch (error) {
    if (error instanceof RecoveryExecutionError) throw error;
    fail('OWNER_PRIVATE_ACL_FAILED');
  }
}

function hardenPath(repositoryRoot, targetPath, kind) {
  return observeOwnerPrivatePath(
    repositoryRoot,
    targetPath,
    kind,
    'PROTECT_AND_CAPTURE'
  );
}

function captureOwnerPrivatePath(repositoryRoot, targetPath, kind) {
  return observeOwnerPrivatePath(repositoryRoot, targetPath, kind, 'CAPTURE');
}

function captureInheritedOwnerPrivatePath(repositoryRoot, targetPath, kind) {
  return observeOwnerPrivatePath(
    repositoryRoot,
    targetPath,
    kind,
    'CAPTURE_EFFECTIVE'
  );
}

async function readBoundedResponse(response, expectedContentTypes) {
  const contentType = response.headers.get('content-type') ?? '';
  if (
    !expectedContentTypes.some(prefix =>
      contentType.toLowerCase().startsWith(prefix)
    )
  ) {
    fail('REMOTE_CONTENT_TYPE_INVALID');
  }
  const declared = response.headers.get('content-length');
  if (declared !== null && Number(declared) > MAX_PROVIDER_BODY_BYTES) {
    fail('REMOTE_BODY_TOO_LARGE');
  }
  if (response.body === null) fail('REMOTE_BODY_MISSING');
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.length;
      if (length > MAX_PROVIDER_BODY_BYTES) fail('REMOTE_BODY_TOO_LARGE');
      chunks.push(item.value);
    }
    return Buffer.concat(chunks, length);
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

async function fetchProviderJson(url, accessToken) {
  assertAllowedRecoveryProviderRequest('GET', url);
  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    fail('READ_ONLY_PROVIDER_CONTACT_FAILED');
  }
  const bytes = await readBoundedResponse(response, ['application/json']);
  try {
    const bodySha256 = sha256Bytes(bytes);
    if (response.status !== 200) fail(`PROVIDER_HTTP_${response.status}`);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return {
      body: JSON.parse(text),
      bodySha256,
      httpStatus: response.status,
    };
  } catch (error) {
    if (error instanceof RecoveryExecutionError) throw error;
    fail('PROVIDER_RESPONSE_INVALID');
  } finally {
    bytes.fill(0);
  }
}

function captureDatabaseIdentity({ psqlPath, caPath, databasePassword }) {
  const sql = [
    'select json_build_object(',
    "'databaseName', current_database(),",
    "'databaseUser', current_user,",
    "'postgresVersion', current_setting('server_version'),",
    "'serverVersionNum', current_setting('server_version_num'),",
    "'systemIdentifier', (select system_identifier::text from pg_control_system()),",
    "'databaseUtc', to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'),",
    "'ssl', (select ssl from pg_stat_ssl where pid = pg_backend_pid()),",
    "'sslVersion', (select version from pg_stat_ssl where pid = pg_backend_pid())",
    ')::text;',
  ].join(' ');
  const result = spawnSync(
    psqlPath,
    [
      '--no-psqlrc',
      '--no-password',
      '--host',
      PR12_RECOVERY_TARGET.directHost,
      '--port',
      '5432',
      '--username',
      'postgres',
      '--dbname',
      'postgres',
      '--set',
      'ON_ERROR_STOP=1',
      '--tuples-only',
      '--no-align',
      '--command',
      sql,
    ],
    {
      cwd: path.dirname(caPath),
      env: {
        SystemRoot: process.env.SystemRoot ?? 'C:\\Windows',
        TEMP: process.env.TEMP ?? 'C:\\Windows\\Temp',
        TMP: process.env.TMP ?? 'C:\\Windows\\Temp',
        PATH: path.dirname(psqlPath),
        PGPASSWORD: databasePassword,
        PGSSLMODE: 'verify-full',
        PGSSLROOTCERT: caPath,
        PGCONNECT_TIMEOUT: '30',
        PGAPPNAME: 'pr12-isolated-qualification-step01',
        PGOPTIONS:
          '-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=30000',
      },
      encoding: 'utf8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    }
  );
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  try {
    if (
      result.status !== 0 ||
      result.error !== undefined ||
      result.signal !== null
    ) {
      fail('DIRECT_DATABASE_UNREACHABLE');
    }
    const line = stdout
      .split(/\r?\n/u)
      .map(value => value.trim())
      .filter(Boolean)
      .at(-1);
    const observation = JSON.parse(line ?? 'null');
    if (
      !isRecord(observation) ||
      observation.databaseName !== 'postgres' ||
      observation.databaseUser !== 'postgres' ||
      observation.ssl !== true ||
      typeof observation.systemIdentifier !== 'string' ||
      !/^(?:0|[1-9][0-9]{0,19})$/u.test(observation.systemIdentifier)
    ) {
      fail('DIRECT_DATABASE_IDENTITY_INVALID');
    }
    return {
      status: 'REACHABLE',
      connectionMode: 'DIRECT',
      projectRef: PR12_RECOVERY_TARGET.projectRef,
      databaseName: observation.databaseName,
      databaseUser: observation.databaseUser,
      postgresVersion: observation.postgresVersion,
      serverVersionNum: observation.serverVersionNum,
      systemIdentifier: observation.systemIdentifier,
      databaseUtc: observation.databaseUtc,
      tls: {
        verifiedMode: 'verify-full',
        enabled: true,
        version: observation.sslVersion,
      },
      stdoutSha256: sha256Bytes(Buffer.from(stdout, 'utf8')),
      stderrSha256: sha256Bytes(Buffer.from(stderr, 'utf8')),
      rawOutputRetained: false,
    };
  } catch (error) {
    if (error instanceof RecoveryExecutionError) throw error;
    fail('DIRECT_DATABASE_IDENTITY_INVALID');
  }
}

function lastJsonLine(stdout, code) {
  for (const line of stdout.split(/\r?\n/u).reverse()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const value = JSON.parse(trimmed);
      if (isRecord(value)) return value;
    } catch {
      // Continue to the preceding line; CLI tools may print non-JSON progress.
    }
  }
  fail(code);
}

function runReplayCommand(
  command,
  environment,
  forbiddenValues,
  journalDirectory,
  repositoryRoot
) {
  const spawnContract = buildPinnedSpawnContract({
    executable: command.executable,
    args: command.args,
    cwd: command.cwd,
    env: environment,
    timeoutMs: command.timeoutMs,
    retries: 0,
  });
  const startedAt = new Date().toISOString();
  const intent = {
    schemaVersion: 1,
    recordType: 'PR12_REPLAY_COMMAND_INTENT',
    commandId: command.id,
    operation: command.operation,
    mutation: command.mutation === true,
    targetProjectRef: PR12_RECOVERY_TARGET.projectRef,
    targetDirectHost: PR12_RECOVERY_TARGET.directHost,
    transport: command.transport,
    argvSha256: sha256Canonical(command.args),
    dispatchMaximum: 1,
    wrapperRetryCount: 0,
    timeoutMs: command.timeoutMs,
    createdAt: startedAt,
    rawArgumentsRetained: false,
    secretValuesCaptured: false,
  };
  const journalStem = command.id.toLowerCase();
  const intentPath = path.join(journalDirectory, `${journalStem}-intent.json`);
  const intentArtifactSha256 = writeCanonicalCreateNew(
    intentPath,
    { ...intent, intentSha256: sha256Canonical(intent) },
    'REPLAY_INTENT_CREATE_FAILED'
  );
  hardenPath(repositoryRoot, intentPath, 'FILE');
  const result = spawnSync(
    spawnContract.executable,
    spawnContract.args,
    spawnContract.options
  );
  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  const stderr = typeof result.stderr === 'string' ? result.stderr : '';
  const outputContainsSecret = forbiddenValues.some(
    secret =>
      secret.length > 0 && (stdout.includes(secret) || stderr.includes(secret))
  );
  const observation = {
    commandId: command.id,
    operation: command.operation,
    startedAt,
    completedAt: new Date().toISOString(),
    dispatchCount: 1,
    wrapperRetryCount: 0,
    exitCode: Number.isInteger(result.status) ? result.status : null,
    timedOut:
      result.error !== undefined &&
      isRecord(result.error) &&
      result.error.code === 'ETIMEDOUT',
    stdoutBytes: Buffer.byteLength(stdout, 'utf8'),
    stdoutSha256: sha256Bytes(Buffer.from(stdout, 'utf8')),
    stderrBytes: Buffer.byteLength(stderr, 'utf8'),
    stderrSha256: sha256Bytes(Buffer.from(stderr, 'utf8')),
    rawOutputRetained: false,
    outcome:
      result.error !== undefined ||
      result.signal !== null ||
      !Number.isInteger(result.status)
        ? 'UNKNOWN_REMOTE_OUTCOME'
        : result.status === 0
          ? 'SUCCEEDED'
          : 'FAILED_DETERMINISTIC',
    intentArtifactSha256,
  };
  const resultPath = path.join(journalDirectory, `${journalStem}-result.json`);
  const resultArtifactSha256 = writeCanonicalCreateNew(
    resultPath,
    { ...observation, observationSha256: sha256Canonical(observation) },
    'REPLAY_RESULT_CREATE_FAILED'
  );
  hardenPath(repositoryRoot, resultPath, 'FILE');
  if (outputContainsSecret) fail('SECRET_BEARING_PROCESS_OUTPUT');
  return {
    observation: { ...observation, resultArtifactSha256 },
    stdout,
  };
}

function executeFullMigrationReplay({
  repositoryRoot,
  replayWorkdir,
  evidenceDirectory,
  databasePassword,
  databaseIdentity,
  caPath,
  supabasePath,
  psqlPath,
  journalDirectory,
  bindingSha256,
}) {
  const startedAt = new Date().toISOString();
  const observations = [];
  let inputManifest = null;
  let materialized = null;
  let inventory = null;
  let lastDispatchedCommand = null;
  try {
    inventory = readAndVerifyFrozenMigrationInventory(repositoryRoot);
    inputManifest = buildExternalReplayInputManifest({
      repoRoot: repositoryRoot,
      externalWorkdir: replayWorkdir,
    });
    materialized = materializeExternalReplayInputs(inputManifest);
    observations.push({
      commandId: 'PR12-CMD-003',
      operation: 'MATERIALIZE_APPROVED_SOURCE_RUNTIME_METADATA',
      dispatchCount: 1,
      wrapperRetryCount: 0,
      outcome: 'SUCCEEDED',
      remoteContact: false,
      manifestSha256: inputManifest.manifestSha256,
      rawOutputRetained: false,
    });
    const runtimeRoot = path.join(replayWorkdir, '.pr12-runtime');
    mkdirSync(runtimeRoot, { recursive: false });
    const supabaseHome = path.join(runtimeRoot, 'supabase-home');
    const dockerConfig = path.join(runtimeRoot, 'docker-config');
    mkdirSync(supabaseHome, { recursive: false });
    mkdirSync(dockerConfig, { recursive: false });
    const directUrl = new URL(
      `postgresql://postgres@${PR12_RECOVERY_TARGET.directHost}:5432/postgres`
    );
    directUrl.searchParams.set('sslmode', 'verify-full');
    directUrl.searchParams.set('sslrootcert', caPath);
    const commandPlan = buildSourceReplayCommandPlan({
      directDatabaseUrl: directUrl.toString(),
      supabasePath,
      psqlPath,
      externalWorkdir: replayWorkdir,
    });
    const environment = buildIsolatedChildEnvironment({
      credentialKind: 'database',
      credentialValues: { PGPASSWORD: databasePassword },
      operatingSystemValues: buildRecoveryOperatingSystemValues({
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        PATH: `${path.dirname(supabasePath)};${path.dirname(psqlPath)}`,
      }),
      isolationPaths: { supabaseHome, dockerConfig },
    });
    let catalogSnapshot = null;
    let migrationHistory = null;
    let advisorBefore = null;
    for (const command of commandPlan.commands.slice(1)) {
      lastDispatchedCommand = command;
      const dispatched = runReplayCommand(
        command,
        environment,
        [databasePassword],
        journalDirectory,
        repositoryRoot
      );
      observations.push(dispatched.observation);
      if (dispatched.observation.outcome !== 'SUCCEEDED') {
        fail(
          dispatched.observation.outcome === 'UNKNOWN_REMOTE_OUTCOME'
            ? 'UNKNOWN_REMOTE_OUTCOME'
            : `${command.id.replaceAll('-', '_')}_FAILED`
        );
      }
      if (command.id === 'PR12-CMD-004') {
        const precondition = lastJsonLine(
          dispatched.stdout,
          'CLEAN_REPLAY_PRECONDITION_INVALID'
        );
        if (
          precondition.operation !== 'SOURCE_CLEAN_REPLAY_PRECONDITION' ||
          precondition.isClean !== true ||
          precondition.appliedMigrationCount !== 0
        ) {
          fail('ISOLATED_PROJECT_NOT_CLEAN');
        }
      } else if (command.id === 'PR12-CMD-006') {
        const findings = parseAdvisorCliJsonOutput(dispatched.stdout);
        advisorBefore = normalizeAdvisorSnapshot({
          schemaVersion: 1,
          commandId: 'PR12-CMD-006',
          bindingSha256,
          projectRef: PR12_RECOVERY_TARGET.projectRef,
          databaseSystemIdentifier: databaseIdentity.systemIdentifier,
          category: 'all',
          capturedAt: dispatched.observation.completedAt,
          findings,
        });
      } else if (command.id === 'PR12-CMD-007A') {
        const observation = lastJsonLine(
          dispatched.stdout,
          'FRESH_CATALOG_OBSERVATION_INVALID'
        );
        const compiledCatalog = compileFreshCatalogSnapshotFromSqlObservation({
          projectRef: PR12_RECOVERY_TARGET.projectRef,
          databaseSystemIdentifier: databaseIdentity.systemIdentifier,
          capturedAt: dispatched.observation.completedAt,
          observation,
        });
        catalogSnapshot = {
          capturedAt: dispatched.observation.completedAt,
          verification: compiledCatalog.verification,
          snapshotSha256: sha256Canonical(compiledCatalog.snapshot),
          rawRowsPersisted: false,
        };
      } else if (command.id === 'PR12-CMD-008A') {
        const observation = lastJsonLine(
          dispatched.stdout,
          'MIGRATION_HISTORY_OBSERVATION_INVALID'
        );
        if (observation.migrationCount !== observation.versions?.length) {
          fail('MIGRATION_HISTORY_OBSERVATION_INVALID');
        }
        migrationHistory = validateMigrationHistoryParity(
          observation.versions,
          inventory
        );
      }
    }
    if (catalogSnapshot === null || migrationHistory === null) {
      fail('MIGRATION_REPLAY_EVIDENCE_INCOMPLETE');
    }
    const resultWithoutHash = {
      schemaVersion: 1,
      recordType: 'PR12_FULL_MIGRATION_REPLAY_RESULT',
      canonicalStep: { step: '02', name: 'full migration replay' },
      status: 'PASS',
      startedAt,
      completedAt: new Date().toISOString(),
      projectRef: PR12_RECOVERY_TARGET.projectRef,
      databaseSystemIdentifier: databaseIdentity.systemIdentifier,
      frozenInput: {
        migrationCount: inventory.migrationCount,
        migrationHead: inventory.migrationHead,
        migrationSetSha256: inventory.migrationSetSha256,
        inputManifestSha256: inputManifest.manifestSha256,
        materializedFileCount: materialized.fileCount,
        seedCopied: false,
        testsCopied: false,
        dotenvCopied: false,
        repositoryTempCopied: false,
      },
      commandSequence: commandPlan.commands.map(command => command.id),
      commandObservations: observations,
      advisorBefore,
      catalogSnapshot,
      migrationHistory,
      wrapperRetryCount: 0,
      rawPathsRetained: false,
      rawOutputsRetained: false,
      secretValuesCaptured: false,
      nextStep: '03',
    };
    assertSecretFreeEvidence(resultWithoutHash, [databasePassword]);
    const result = {
      ...resultWithoutHash,
      evidenceSha256: sha256Canonical(resultWithoutHash),
    };
    const filename = path.join(evidenceDirectory, STEP02_EVIDENCE_FILE);
    writeCanonicalCreateNew(filename, result, 'STEP02_EVIDENCE_CREATE_FAILED');
    hardenPath(repositoryRoot, filename, 'FILE');
    return result;
  } catch (error) {
    const reasonCode =
      error instanceof Error && /^[A-Z0-9_-]+$/u.test(error.message)
        ? error.message
        : 'UNEXPECTED_REPLAY_FAILURE';
    let lastDurableResult = null;
    if (lastDispatchedCommand !== null) {
      const resultPath = path.join(
        journalDirectory,
        `${lastDispatchedCommand.id.toLowerCase()}-result.json`
      );
      if (existsSync(resultPath)) {
        try {
          const snapshot = readCanonicalJson(
            resultPath,
            'REPLAY_RESULT_INVALID'
          );
          if (
            snapshot.value.commandId === lastDispatchedCommand.id &&
            ['SUCCEEDED', 'FAILED_DETERMINISTIC'].includes(
              snapshot.value.outcome
            )
          ) {
            lastDurableResult = {
              commandId: snapshot.value.commandId,
              outcome: snapshot.value.outcome,
              resultArtifactSha256: snapshot.sha256,
              intentArtifactSha256: snapshot.value.intentArtifactSha256 ?? null,
            };
          }
        } catch {
          lastDurableResult = null;
        }
      }
    }
    const blockedWithoutHash = {
      schemaVersion: 1,
      recordType: 'PR12_FULL_MIGRATION_REPLAY_RESULT',
      canonicalStep: { step: '02', name: 'full migration replay' },
      status: 'BLOCK',
      reasonCode,
      startedAt,
      completedAt: new Date().toISOString(),
      projectRef: PR12_RECOVERY_TARGET.projectRef,
      databaseSystemIdentifier: databaseIdentity.systemIdentifier,
      completedCommandIds: observations
        .filter(item => item.outcome === 'SUCCEEDED')
        .map(item => item.commandId),
      commandObservations: observations,
      lastDispatchedCommand:
        lastDispatchedCommand === null
          ? null
          : {
              commandId: lastDispatchedCommand.id,
              mutation: lastDispatchedCommand.mutation === true,
              timeoutMs: lastDispatchedCommand.timeoutMs,
            },
      lastDurableResult,
      mutationOutcomeUnknown:
        lastDispatchedCommand?.mutation === true && lastDurableResult === null,
      wrapperRetryCount: 0,
      rawPathsRetained: false,
      rawOutputsRetained: false,
      secretValuesCaptured: false,
    };
    assertSecretFreeEvidence(blockedWithoutHash, [databasePassword]);
    const blocked = {
      ...blockedWithoutHash,
      evidenceSha256: sha256Canonical(blockedWithoutHash),
    };
    const filename = path.join(evidenceDirectory, STEP02_EVIDENCE_FILE);
    if (!existsSync(filename)) {
      writeCanonicalCreateNew(
        filename,
        blocked,
        'STEP02_BLOCK_EVIDENCE_CREATE_FAILED'
      );
      hardenPath(repositoryRoot, filename, 'FILE');
    }
    throw error;
  }
}

function resumeFullMigrationReplayAfterCatalogGap({
  repositoryRoot,
  replayWorkdir,
  evidenceDirectory,
  databasePassword,
  databaseIdentity,
  caPath,
  supabasePath,
  psqlPath,
  journalDirectory,
  catalogGapAttempt,
}) {
  const startedAt = new Date().toISOString();
  const observations = [];
  let lastDispatchedCommand = null;
  try {
    const inventory = readAndVerifyFrozenMigrationInventory(repositoryRoot);
    const inputManifest = buildExternalReplayInputManifest({
      repoRoot: repositoryRoot,
      externalWorkdir: replayWorkdir,
    });
    const materialized = materializeExternalReplayInputs(inputManifest);
    observations.push({
      commandId: 'PR12-CMD-003',
      operation: 'MATERIALIZE_APPROVED_SOURCE_RUNTIME_METADATA',
      dispatchCount: 1,
      wrapperRetryCount: 0,
      outcome: 'SUCCEEDED',
      remoteContact: false,
      manifestSha256: inputManifest.manifestSha256,
      rawOutputRetained: false,
    });
    const runtimeRoot = path.join(replayWorkdir, '.pr12-runtime');
    mkdirSync(runtimeRoot, { recursive: false });
    const supabaseHome = path.join(runtimeRoot, 'supabase-home');
    const dockerConfig = path.join(runtimeRoot, 'docker-config');
    mkdirSync(supabaseHome, { recursive: false });
    mkdirSync(dockerConfig, { recursive: false });
    const commandPlan = buildPostApplyReplayRecoveryCommandPlan({
      directDatabaseUrl: directDatabaseUrl(caPath),
      supabasePath,
      psqlPath,
      externalWorkdir: replayWorkdir,
    });
    if (
      commandPlan.migrationApplyRedispatchAllowed !== false ||
      commandPlan.commands.some(command => command.id === 'PR12-CMD-007')
    ) {
      fail('MIGRATION_APPLY_REDISPATCH_FORBIDDEN');
    }
    const environment = buildIsolatedChildEnvironment({
      credentialKind: 'database',
      credentialValues: { PGPASSWORD: databasePassword },
      operatingSystemValues: buildRecoveryOperatingSystemValues({
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        PATH: `${path.dirname(supabasePath)};${path.dirname(psqlPath)}`,
      }),
      isolationPaths: { supabaseHome, dockerConfig },
    });
    let catalogSnapshot = null;
    let migrationHistory = null;
    for (const command of commandPlan.commands) {
      lastDispatchedCommand = command;
      const dispatched = runReplayCommand(
        command,
        environment,
        [databasePassword],
        journalDirectory,
        repositoryRoot
      );
      observations.push(dispatched.observation);
      if (dispatched.observation.outcome !== 'SUCCEEDED') {
        fail(
          dispatched.observation.outcome === 'UNKNOWN_REMOTE_OUTCOME'
            ? 'UNKNOWN_REMOTE_OUTCOME'
            : `${command.id.replaceAll('-', '_')}_FAILED`
        );
      }
      if (command.id === 'PR12-CMD-007A') {
        const observation = lastJsonLine(
          dispatched.stdout,
          'FRESH_CATALOG_OBSERVATION_INVALID'
        );
        const compiledCatalog =
          compileFunctionalReplayCatalogFromSqlObservation({
            projectRef: PR12_RECOVERY_TARGET.projectRef,
            databaseSystemIdentifier: databaseIdentity.systemIdentifier,
            capturedAt: dispatched.observation.completedAt,
            observation,
          });
        catalogSnapshot = {
          capturedAt: dispatched.observation.completedAt,
          verification: compiledCatalog.verification,
          hostedApiConfiguration: {
            dataApi: compiledCatalog.snapshot.dataApi,
            graphql: compiledCatalog.snapshot.graphql,
          },
          snapshotSha256: sha256Canonical(compiledCatalog.snapshot),
          rawRowsPersisted: false,
        };
      } else if (command.id === 'PR12-CMD-008A') {
        const observation = lastJsonLine(
          dispatched.stdout,
          'MIGRATION_HISTORY_OBSERVATION_INVALID'
        );
        if (observation.migrationCount !== observation.versions?.length) {
          fail('MIGRATION_HISTORY_OBSERVATION_INVALID');
        }
        migrationHistory = validateMigrationHistoryParity(
          observation.versions,
          inventory
        );
      }
    }
    if (catalogSnapshot === null || migrationHistory === null) {
      fail('MIGRATION_REPLAY_EVIDENCE_INCOMPLETE');
    }
    const advisorBefore = normalizeAdvisorSnapshot({
      schemaVersion: 1,
      commandId: 'PR12-CMD-006',
      bindingSha256: catalogGapAttempt.executionBindingSha256,
      projectRef: PR12_RECOVERY_TARGET.projectRef,
      databaseSystemIdentifier: databaseIdentity.systemIdentifier,
      category: 'all',
      capturedAt: catalogGapAttempt.advisorBefore.capturedAt,
      findings: [],
    });
    const resultWithoutHash = {
      schemaVersion: 1,
      recordType: 'PR12_FULL_MIGRATION_REPLAY_RESULT',
      canonicalStep: { step: '02', name: 'full migration replay' },
      status: 'PASS',
      startedAt,
      completedAt: new Date().toISOString(),
      projectRef: PR12_RECOVERY_TARGET.projectRef,
      databaseSystemIdentifier: databaseIdentity.systemIdentifier,
      frozenInput: {
        migrationCount: inventory.migrationCount,
        migrationHead: inventory.migrationHead,
        migrationSetSha256: inventory.migrationSetSha256,
        inputManifestSha256: inputManifest.manifestSha256,
        materializedFileCount: materialized.fileCount,
        seedCopied: false,
        testsCopied: false,
        dotenvCopied: false,
        repositoryTempCopied: false,
      },
      postApplyRecovery: {
        predecessorLinkSha256: catalogGapAttempt.linkSha256,
        predecessorStep02EvidenceSha256: catalogGapAttempt.step02EvidenceSha256,
        migrationApplyDispatchCount:
          catalogGapAttempt.migrationApplyDispatchCount,
        migrationApplyOutcome: catalogGapAttempt.migrationApplyOutcome,
        migrationApplyRedispatched: false,
        priorCatalogGap: catalogGapAttempt.reasonCode,
      },
      commandSequence: [
        'PR12-CMD-003',
        ...commandPlan.commands.map(command => command.id),
      ],
      commandObservations: observations,
      advisorBefore,
      advisorBeforeSource: {
        predecessorExecutionBindingSha256:
          catalogGapAttempt.executionBindingSha256,
        predecessorStdoutSha256: catalogGapAttempt.advisorBefore.stdoutSha256,
        findingCount: catalogGapAttempt.advisorBefore.findingCount,
        rawOutputRetained: false,
      },
      catalogSnapshot,
      migrationHistory,
      wrapperRetryCount: 0,
      rawPathsRetained: false,
      rawOutputsRetained: false,
      secretValuesCaptured: false,
      nextStep: '03',
    };
    assertSecretFreeEvidence(resultWithoutHash, [databasePassword]);
    const result = {
      ...resultWithoutHash,
      evidenceSha256: sha256Canonical(resultWithoutHash),
    };
    const filename = path.join(evidenceDirectory, STEP02_EVIDENCE_FILE);
    writeCanonicalCreateNew(filename, result, 'STEP02_EVIDENCE_CREATE_FAILED');
    hardenPath(repositoryRoot, filename, 'FILE');
    return result;
  } catch (error) {
    const reasonCode =
      error instanceof Error && /^[A-Z0-9_-]+$/u.test(error.message)
        ? error.message
        : 'UNEXPECTED_REPLAY_FAILURE';
    const blockedWithoutHash = {
      schemaVersion: 1,
      recordType: 'PR12_FULL_MIGRATION_REPLAY_RESULT',
      canonicalStep: { step: '02', name: 'full migration replay' },
      status: 'BLOCK',
      reasonCode,
      startedAt,
      completedAt: new Date().toISOString(),
      projectRef: PR12_RECOVERY_TARGET.projectRef,
      databaseSystemIdentifier: databaseIdentity.systemIdentifier,
      predecessorStep02EvidenceSha256: catalogGapAttempt.step02EvidenceSha256,
      completedCommandIds: observations
        .filter(item => item.outcome === 'SUCCEEDED')
        .map(item => item.commandId),
      commandObservations: observations,
      lastDispatchedCommand:
        lastDispatchedCommand === null
          ? null
          : {
              commandId: lastDispatchedCommand.id,
              mutation: false,
              timeoutMs: lastDispatchedCommand.timeoutMs,
            },
      migrationApplyDispatchCount: 0,
      migrationApplyRedispatched: false,
      mutationOutcomeUnknown: false,
      wrapperRetryCount: 0,
      rawPathsRetained: false,
      rawOutputsRetained: false,
      secretValuesCaptured: false,
    };
    assertSecretFreeEvidence(blockedWithoutHash, [databasePassword]);
    const blocked = {
      ...blockedWithoutHash,
      evidenceSha256: sha256Canonical(blockedWithoutHash),
    };
    const filename = path.join(evidenceDirectory, STEP02_EVIDENCE_FILE);
    if (!existsSync(filename)) {
      writeCanonicalCreateNew(
        filename,
        blocked,
        'STEP02_BLOCK_EVIDENCE_CREATE_FAILED'
      );
      hardenPath(repositoryRoot, filename, 'FILE');
    }
    throw error;
  }
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function deterministicUuid(prefix, index) {
  const first = prefix.endsWith('-') ? prefix.slice(0, -1) : prefix;
  return `${first}-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function directDatabaseUrl(caPath) {
  const url = new URL(
    `postgresql://postgres@${PR12_RECOVERY_TARGET.directHost}:5432/postgres`
  );
  url.searchParams.set('sslmode', 'verify-full');
  url.searchParams.set('sslrootcert', caPath);
  return url.toString();
}

function executePsqlInput({
  psqlPath,
  databaseUrl,
  databasePassword,
  cwd,
  sql,
  timeoutMs,
  forbiddenValues,
}) {
  const result = spawnSync(
    psqlPath,
    [
      '--no-psqlrc',
      '--no-password',
      '--set',
      'ON_ERROR_STOP=1',
      '--tuples-only',
      '--no-align',
      '--dbname',
      databaseUrl,
    ],
    {
      cwd,
      env: {
        SystemRoot: process.env.SystemRoot ?? 'C:\\Windows',
        TEMP: process.env.TEMP ?? 'C:\\Windows\\Temp',
        TMP: process.env.TMP ?? 'C:\\Windows\\Temp',
        PATH: path.dirname(psqlPath),
        PGPASSWORD: databasePassword,
      },
      input: sql,
      encoding: 'utf8',
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    }
  );
  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  const stderr = typeof result.stderr === 'string' ? result.stderr : '';
  if (
    forbiddenValues.some(
      value =>
        value.length > 0 && (stdout.includes(value) || stderr.includes(value))
    )
  ) {
    fail('SECRET_BEARING_PROCESS_OUTPUT');
  }
  const observation = {
    exitCode: Number.isInteger(result.status) ? result.status : null,
    timedOut: isRecord(result.error) && result.error.code === 'ETIMEDOUT',
    stdoutBytes: Buffer.byteLength(stdout, 'utf8'),
    stdoutSha256: sha256Bytes(Buffer.from(stdout, 'utf8')),
    stderrBytes: Buffer.byteLength(stderr, 'utf8'),
    stderrSha256: sha256Bytes(Buffer.from(stderr, 'utf8')),
    rawOutputRetained: false,
    dispatchCount: 1,
    wrapperRetryCount: 0,
    outcome:
      result.error !== undefined ||
      result.signal !== null ||
      !Number.isInteger(result.status)
        ? 'UNKNOWN_REMOTE_OUTCOME'
        : result.status === 0
          ? 'SUCCEEDED'
          : 'FAILED_DETERMINISTIC',
  };
  return { stdout, observation };
}

function buildRepresentativeActorRuntime(actorPasswords) {
  const payloadIdentity = createRepresentativeFixturePayloadIdentity();
  const payloadFingerprints =
    fingerprintRepresentativeFixturePayloadIdentity(payloadIdentity);
  const clinicRows = payloadIdentity['public.clinics'];
  const clinicIdByFixtureId = Object.fromEntries(
    clinicRows.map((clinic, index) => [
      clinic.clinicId,
      deterministicUuid('10000000-', index + 1),
    ])
  );
  const clinics = clinicRows.map(
    clinic => clinicIdByFixtureId[clinic.clinicId]
  );
  const actorDefinitions = payloadIdentity['auth.users'].map((actor, index) => {
    const password = actorPasswords[actor.actorId];
    if (typeof password !== 'string' || password.length < 32) {
      fail('REPRESENTATIVE_ACTOR_PASSWORD_INVALID');
    }
    return {
      actorId: actor.actorId,
      role: actor.role,
      clinicId:
        actor.clinicId === null ? null : clinicIdByFixtureId[actor.clinicId],
      id: deterministicUuid('20000000-', index + 1),
      email: `pr12+${actor.actorId}@invalid.example`,
      password,
    };
  });
  return {
    payloadIdentity,
    payloadFingerprints,
    clinicIdByFixtureId,
    clinics,
    actorDefinitions,
  };
}

function buildRepresentativeFixtureSql(actorPasswords) {
  const runtime = buildRepresentativeActorRuntime(actorPasswords);
  const {
    payloadIdentity,
    payloadFingerprints,
    clinicIdByFixtureId,
    clinics,
    actorDefinitions,
  } = runtime;
  const actorById = Object.fromEntries(
    actorDefinitions.map(actor => [actor.actorId, actor])
  );
  const values = rows => rows.join(',\n');
  const userMetadata = JSON.stringify({});
  const userRows = actorDefinitions.map(actor => {
    const appMetadata = JSON.stringify({
      provider: 'email',
      providers: ['email'],
      role: actor.role,
      clinic_id: actor.clinicId,
    });
    return `(${sqlLiteral(actor.id)},'authenticated','authenticated',${sqlLiteral(actor.email)},extensions.crypt(${sqlLiteral(actor.password)},extensions.gen_salt('bf')),now(),${sqlLiteral(appMetadata)}::jsonb,${sqlLiteral(userMetadata)}::jsonb,now(),now())`;
  });
  const identityRows = actorDefinitions.map(
    actor =>
      `(${sqlLiteral(actor.id)},${sqlLiteral(actor.id)},'email',${sqlLiteral(actor.email)},${sqlLiteral(JSON.stringify({ sub: actor.id, email: actor.email, email_verified: true }))}::jsonb,now(),now(),now())`
  );
  const profileRows = actorDefinitions.map(
    actor =>
      `(${sqlLiteral(actor.id)},${sqlLiteral(actor.id)},${actor.clinicId === null ? 'null' : sqlLiteral(actor.clinicId)},${sqlLiteral(actor.email)},${sqlLiteral(`PR12 ${actor.actorId}`)},${sqlLiteral(actor.role)},true)`
  );
  const staffRows = actorDefinitions.map(
    actor =>
      `(${sqlLiteral(actor.id)},${actor.clinicId === null ? 'null' : sqlLiteral(actor.clinicId)},${sqlLiteral(`PR12 ${actor.actorId}`)},${sqlLiteral(actor.role)},${actor.role === 'therapist' ? 'true' : 'false'},${sqlLiteral(actor.email)},'managed_by_supabase')`
  );
  const permissionRows = actorDefinitions.map(
    actor =>
      `(gen_random_uuid(),${sqlLiteral(actor.id)},${sqlLiteral(actor.email)},'managed_by_supabase',${sqlLiteral(actor.role)},${actor.clinicId === null ? 'null' : sqlLiteral(actor.clinicId)})`
  );
  const customers = payloadIdentity['public.customers'].map((item, index) => ({
    id: deterministicUuid('30000000-', index + 1),
    clinic: clinicIdByFixtureId[item.clinicId],
  }));
  const patients = payloadIdentity['public.patients'].map((item, index) => ({
    id: deterministicUuid('40000000-', index + 1),
    clinic: clinicIdByFixtureId[item.clinicId],
  }));
  const menus = payloadIdentity['public.menus'].map((item, index) => ({
    id: deterministicUuid('50000000-', index + 1),
    clinic: clinicIdByFixtureId[item.clinicId],
  }));
  const resources = payloadIdentity['public.resources'].map((item, index) => ({
    id: deterministicUuid('60000000-', index + 1),
    clinic: clinicIdByFixtureId[item.clinicId],
    actorId: item.actorId,
  }));
  const resourceByActorId = Object.fromEntries(
    resources.map(resource => [resource.actorId, resource])
  );
  const reservations = payloadIdentity['public.reservations'].map(
    (item, index) => ({
      id: deterministicUuid('70000000-', index + 1),
      customer: customers[index % customers.length].id,
      menu: menus[index % menus.length].id,
      resource: resources[index % resources.length].id,
      clinic: clinicIdByFixtureId[item.clinicId],
      status: item.statusClass === 'COMPLETED' ? 'completed' : 'confirmed',
      ordinal: index + 1,
    })
  );
  const shifts = payloadIdentity['public.staff_shifts'].map((item, index) => ({
    id: deterministicUuid('80000000-', index + 1),
    clinic: clinicIdByFixtureId[item.clinicId],
    resource: resourceByActorId[item.actorId],
    ordinal: index + 1,
  }));
  const sql = `
\\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '300s';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE email LIKE 'pr12+%@invalid.example')
     OR EXISTS (SELECT 1 FROM public.clinics WHERE name LIKE 'PR12 Synthetic%')
  THEN RAISE EXCEPTION 'PR12_FIXTURE_TARGET_NOT_EMPTY'; END IF;
END $$;
INSERT INTO public.clinics (id,name,parent_id,is_active) VALUES
(${sqlLiteral(clinics[0])},'PR12 Synthetic Tenant A Root',null,true),
(${sqlLiteral(clinics[1])},'PR12 Synthetic Tenant A Child',${sqlLiteral(clinics[0])},true),
(${sqlLiteral(clinics[2])},'PR12 Synthetic Tenant B Root',null,true),
(${sqlLiteral(clinics[3])},'PR12 Synthetic Tenant B Child',${sqlLiteral(clinics[2])},true);
INSERT INTO auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) VALUES
${values(userRows)};
INSERT INTO auth.identities (id,user_id,provider,provider_id,identity_data,created_at,updated_at,last_sign_in_at) VALUES
${values(identityRows)};
INSERT INTO public.profiles (id,user_id,clinic_id,email,full_name,role,is_active) VALUES
${values(profileRows)};
INSERT INTO public.staff (id,clinic_id,name,role,is_therapist,email,password_hash) VALUES
${values(staffRows)};
INSERT INTO public.user_permissions (id,staff_id,username,hashed_password,role,clinic_id) VALUES
${values(permissionRows)};
INSERT INTO public.manager_clinic_assignments (id,manager_user_id,clinic_id,assigned_by) VALUES
(${sqlLiteral(deterministicUuid('e0000000-', 1))},${sqlLiteral(actorDefinitions[2].id)},${sqlLiteral(clinics[1])},${sqlLiteral(actorDefinitions[0].id)});
INSERT INTO public.customers (id,name,phone,clinic_id) VALUES
${values(customers.map((item, index) => `(${sqlLiteral(item.id)},${sqlLiteral(`PR12 Customer ${index + 1}`)},${sqlLiteral(`0000000${index + 1}`)},${sqlLiteral(item.clinic)})`))};
INSERT INTO public.patients (id,clinic_id,name) VALUES
${values(patients.map((item, index) => `(${sqlLiteral(item.id)},${sqlLiteral(item.clinic)},${sqlLiteral(`PR12 Patient ${index + 1}`)})`))};
INSERT INTO public.menus (id,name,price,duration_minutes,clinic_id) VALUES
${values(menus.map((item, index) => `(${sqlLiteral(item.id)},${sqlLiteral(`PR12 Menu ${index + 1}`)},1000,30,${sqlLiteral(item.clinic)})`))};
INSERT INTO public.resources (id,name,type,clinic_id) VALUES
${values(resources.map((item, index) => `(${sqlLiteral(item.id)},${sqlLiteral(`PR12 Resource ${index + 1}`)},'staff',${sqlLiteral(item.clinic)})`))};
INSERT INTO public.reservations (id,customer_id,menu_id,staff_id,start_time,end_time,status,channel,clinic_id,created_by) VALUES
${values(reservations.map(item => `(${sqlLiteral(item.id)},${sqlLiteral(item.customer)},${sqlLiteral(item.menu)},${sqlLiteral(item.resource)},'2026-08-${String(10 + item.ordinal).padStart(2, '0')} 09:00:00+09','2026-08-${String(10 + item.ordinal).padStart(2, '0')} 09:30:00+09',${sqlLiteral(item.status)},'web',${sqlLiteral(item.clinic)},${sqlLiteral(actorById['tenant-a-admin'].id)})`))};
INSERT INTO public.staff_shifts (id,clinic_id,staff_id,start_time,end_time,status,created_by) VALUES
${values(shifts.map(item => `(${sqlLiteral(item.id)},${sqlLiteral(item.clinic)},${sqlLiteral(item.resource.id)},'2026-08-${String(10 + item.ordinal).padStart(2, '0')} 09:00:00+09','2026-08-${String(10 + item.ordinal).padStart(2, '0')} 17:00:00+09','confirmed',${sqlLiteral(actorById['tenant-a-admin'].id)})`))};
INSERT INTO public.staff_preferences (id,clinic_id,staff_id,preference_text) VALUES
(${sqlLiteral(deterministicUuid('90000000-', 1))},${sqlLiteral(clinics[1])},${sqlLiteral(resourceByActorId['tenant-a-therapist'].id)},'PR12 synthetic preference 1'),
(${sqlLiteral(deterministicUuid('90000000-', 2))},${sqlLiteral(clinics[1])},${sqlLiteral(resourceByActorId['tenant-a-staff'].id)},'PR12 synthetic preference 2');
INSERT INTO public.audit_logs (id,event_type,user_id,clinic_id,details) VALUES
(${sqlLiteral(deterministicUuid('a0000000-', 1))},'PR12_SYNTHETIC',${sqlLiteral(actorDefinitions[0].id)},${sqlLiteral(clinics[1])},'{"ordinal":1}'),
(${sqlLiteral(deterministicUuid('a0000000-', 2))},'PR12_SYNTHETIC',${sqlLiteral(actorDefinitions[2].id)},${sqlLiteral(clinics[1])},'{"ordinal":2}');
INSERT INTO public.user_sessions (id,user_id,clinic_id,session_token,expires_at) VALUES
(${sqlLiteral(deterministicUuid('c0000000-', 1))},${sqlLiteral(actorById['tenant-a-admin'].id)},${sqlLiteral(clinics[1])},'pr12-synthetic-non-secret-session-1',now()+interval '1 hour'),
(${sqlLiteral(deterministicUuid('c0000000-', 2))},${sqlLiteral(actorById['tenant-a-staff'].id)},${sqlLiteral(clinics[1])},'pr12-synthetic-non-secret-session-2',now()+interval '1 hour');
INSERT INTO public.security_events (id,user_id,clinic_id,session_id,event_type,event_category,event_description) VALUES
(${sqlLiteral(deterministicUuid('b0000000-', 1))},${sqlLiteral(actorById['tenant-a-admin'].id)},${sqlLiteral(clinics[1])},${sqlLiteral(deterministicUuid('c0000000-', 1))},'PR12_AUTH_SUCCESS','authentication','PR12 synthetic event'),
(${sqlLiteral(deterministicUuid('b0000000-', 2))},${sqlLiteral(actorById['tenant-a-clinic-admin'].id)},${sqlLiteral(clinics[1])},null,'PR12_AUTH_REFRESH','authentication','PR12 synthetic event');
INSERT INTO public.ai_comments (id,clinic_id,comment_date,summary) VALUES
(${sqlLiteral(deterministicUuid('d0000000-', 1))},${sqlLiteral(clinics[1])},'2026-08-10','PR12 synthetic comment');
SELECT json_build_object(
  'explicitTotal', 83,
  'derivedReservationHistory', (SELECT count(*) FROM public.reservation_history WHERE reservation_id::text LIKE '70000000-%'),
  'authUsers', (SELECT count(*) FROM auth.users WHERE email LIKE 'pr12+%@invalid.example'),
  'authIdentities', (SELECT count(*) FROM auth.identities WHERE identity_data->>'email' LIKE 'pr12+%@invalid.example'),
  'clinics', (SELECT count(*) FROM public.clinics WHERE name LIKE 'PR12 Synthetic%'),
  'profiles', (SELECT count(*) FROM public.profiles WHERE email LIKE 'pr12+%@invalid.example'),
  'staff', (SELECT count(*) FROM public.staff WHERE email LIKE 'pr12+%@invalid.example'),
  'permissions', (SELECT count(*) FROM public.user_permissions WHERE username LIKE 'pr12+%@invalid.example'),
  'managerAssignments', (SELECT count(*) FROM public.manager_clinic_assignments WHERE manager_user_id=${sqlLiteral(actorDefinitions[2].id)}),
  'verifiedTotal', 83 + (SELECT count(*) FROM public.reservation_history WHERE reservation_id::text LIKE '70000000-%')
)::text;
COMMIT;
`;
  return {
    sql,
    actorDefinitions,
    clinicIds: clinics,
    payloadAggregateSha256: payloadFingerprints.aggregateSha256,
    actorTopologySha256: payloadFingerprints.actorTopologySha256,
  };
}

function buildRepresentativeSnapshotSql() {
  const filters = {
    'auth.identities': "identity_data->>'email' LIKE 'pr12+%@invalid.example'",
    'auth.users': "email LIKE 'pr12+%@invalid.example'",
    'public.ai_comments': "id::text LIKE 'd0000000-%'",
    'public.audit_logs': "id::text LIKE 'a0000000-%'",
    'public.clinics': "id::text LIKE '10000000-%'",
    'public.customers': "id::text LIKE '30000000-%'",
    'public.manager_clinic_assignments': "id::text LIKE 'e0000000-%'",
    'public.menus': "id::text LIKE '50000000-%'",
    'public.patients': "id::text LIKE '40000000-%'",
    'public.profiles': "id::text LIKE '20000000-%'",
    'public.reservation_history': "reservation_id::text LIKE '70000000-%'",
    'public.reservations': "id::text LIKE '70000000-%'",
    'public.resources': "id::text LIKE '60000000-%'",
    'public.security_events': "id::text LIKE 'b0000000-%'",
    'public.staff': "id::text LIKE '20000000-%'",
    'public.staff_preferences': "id::text LIKE '90000000-%'",
    'public.staff_shifts': "id::text LIKE '80000000-%'",
    'public.user_permissions': "username LIKE 'pr12+%@invalid.example'",
    'public.user_sessions': "id::text LIKE 'c0000000-%'",
  };
  const querySha256ByRelation = {};
  const queries = REPRESENTATIVE_FIXTURE_RELATION_ORDER.map(relation => {
    const filter = filters[relation];
    if (typeof filter !== 'string') fail('FIXTURE_SNAPSHOT_FILTER_MISSING');
    const query = `WITH ordered_rows AS (SELECT id::text AS primary_key,to_jsonb(source)::text AS row_json FROM ${relation} AS source WHERE ${filter} ORDER BY id ASC NULLS FIRST) SELECT json_build_object('relation',${sqlLiteral(relation)},'rowCount',count(*),'digest',encode(extensions.digest(convert_to(COALESCE(string_agg(octet_length(row_json)::text || ':' || row_json || E'\\n','' ORDER BY primary_key),''),'UTF8'),'sha256'),'hex'))::text FROM ordered_rows;`;
    querySha256ByRelation[relation] = sha256Bytes(Buffer.from(query, 'utf8'));
    return query;
  });
  return {
    sql: `\\set ON_ERROR_STOP on\nBEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n${queries.join('\n')}\nROLLBACK;\n`,
    querySha256ByRelation,
  };
}

function executeRepresentativeDataValidation({
  repositoryRoot,
  evidenceDirectory,
  replayWorkdir,
  psqlPath,
  caPath,
  databasePassword,
  journalDirectory,
  databaseIdentity,
  schemaHash,
}) {
  const fixture = compileRepresentativeFixturePlan();
  const actorPasswords = Object.fromEntries(
    [
      'tenant-a-admin',
      'tenant-a-clinic-admin',
      'tenant-a-manager',
      'tenant-a-therapist',
      'tenant-a-staff',
      'tenant-b-staff',
      'no-clinic-staff',
    ].map(actorId => [actorId, randomBytes(36).toString('base64url')])
  );
  const compiled = buildRepresentativeFixtureSql(actorPasswords);
  let intentArtifactSha256 = null;
  let resultArtifactSha256 = null;
  let durableMutationOutcome = null;
  try {
    const intent = {
      schemaVersion: 1,
      recordType: 'PR12_REPRESENTATIVE_FIXTURE_LOAD_INTENT',
      commandId: 'PR12-CMD-008',
      mutation: true,
      targetProjectRef: PR12_RECOVERY_TARGET.projectRef,
      targetDirectHost: PR12_RECOVERY_TARGET.directHost,
      fixturePlanSha256: fixture.planSha256,
      payloadAggregateSha256: compiled.payloadAggregateSha256,
      actorTopologySha256: compiled.actorTopologySha256,
      explicitRows: 83,
      expectedDerivedRows: 12,
      dispatchMaximum: 1,
      wrapperRetryCount: 0,
      createdAt: new Date().toISOString(),
      rawSqlRetained: false,
      secretValuesCaptured: false,
    };
    const intentPath = path.join(journalDirectory, 'pr12-cmd-008-intent.json');
    intentArtifactSha256 = writeCanonicalCreateNew(
      intentPath,
      { ...intent, intentSha256: sha256Canonical(intent) },
      'STEP03_INTENT_CREATE_FAILED'
    );
    hardenPath(repositoryRoot, intentPath, 'FILE');
    const dispatched = executePsqlInput({
      psqlPath,
      databaseUrl: directDatabaseUrl(caPath),
      databasePassword,
      cwd: replayWorkdir,
      sql: compiled.sql,
      timeoutMs: 300_000,
      forbiddenValues: [databasePassword, ...Object.values(actorPasswords)],
    });
    const resultPath = path.join(journalDirectory, 'pr12-cmd-008-result.json');
    const resultObservation = {
      ...dispatched.observation,
      commandId: 'PR12-CMD-008',
      intentArtifactSha256,
    };
    resultArtifactSha256 = writeCanonicalCreateNew(
      resultPath,
      {
        ...resultObservation,
        observationSha256: sha256Canonical(resultObservation),
      },
      'STEP03_RESULT_CREATE_FAILED'
    );
    hardenPath(repositoryRoot, resultPath, 'FILE');
    durableMutationOutcome = dispatched.observation.outcome;
    if (dispatched.observation.outcome !== 'SUCCEEDED') {
      fail(
        dispatched.observation.outcome === 'UNKNOWN_REMOTE_OUTCOME'
          ? 'UNKNOWN_REMOTE_OUTCOME'
          : 'REPRESENTATIVE_FIXTURE_LOAD_FAILED'
      );
    }
    const counts = lastJsonLine(
      dispatched.stdout,
      'REPRESENTATIVE_FIXTURE_RESULT_INVALID'
    );
    if (
      counts.explicitTotal !== 83 ||
      counts.derivedReservationHistory !== 12 ||
      counts.authUsers !== 7 ||
      counts.authIdentities !== 7 ||
      counts.clinics !== 4 ||
      counts.profiles !== 7 ||
      counts.staff !== 7 ||
      counts.permissions !== 7 ||
      counts.managerAssignments !== 1 ||
      counts.verifiedTotal !== 95
    ) {
      fail('REPRESENTATIVE_FIXTURE_COUNT_MISMATCH');
    }
    const snapshotPlan = buildRepresentativeSnapshotSql();
    const snapshotDispatch = executePsqlInput({
      psqlPath,
      databaseUrl: directDatabaseUrl(caPath),
      databasePassword,
      cwd: replayWorkdir,
      sql: snapshotPlan.sql,
      timeoutMs: 300_000,
      forbiddenValues: [databasePassword, ...Object.values(actorPasswords)],
    });
    if (snapshotDispatch.observation.outcome !== 'SUCCEEDED') {
      fail('REPRESENTATIVE_FIXTURE_SNAPSHOT_FAILED');
    }
    const snapshotRows = snapshotDispatch.stdout
      .split(/\r?\n/u)
      .map(line => line.trim())
      .filter(line => line.startsWith('{'))
      .map(line => JSON.parse(line));
    if (snapshotRows.length !== REPRESENTATIVE_FIXTURE_RELATION_ORDER.length) {
      fail('REPRESENTATIVE_FIXTURE_SNAPSHOT_INVALID');
    }
    const rowCounts = {};
    const relationDigests = {};
    for (const relation of REPRESENTATIVE_FIXTURE_RELATION_ORDER) {
      const observed = snapshotRows.find(item => item.relation === relation);
      if (
        !isRecord(observed) ||
        observed.rowCount !== REPRESENTATIVE_FIXTURE_SNAPSHOT_ROWS[relation] ||
        typeof observed.digest !== 'string' ||
        !/^[a-f0-9]{64}$/u.test(observed.digest)
      ) {
        fail('REPRESENTATIVE_FIXTURE_SNAPSHOT_INVALID');
      }
      rowCounts[relation] = observed.rowCount;
      relationDigests[relation] = observed.digest;
    }
    const aggregateDataHash = computeRepresentativeAggregateDataHash(
      rowCounts,
      snapshotPlan.querySha256ByRelation,
      relationDigests
    );
    const snapshot = {
      schemaVersion: 1,
      resultType: 'PR12_REPRESENTATIVE_FIXTURE_SNAPSHOT',
      commandId: 'PR12-CMD-009',
      fixturePlanSha256: fixture.planSha256,
      transaction: 'REPEATABLE_READ_READ_ONLY',
      relationOrder: [...REPRESENTATIVE_FIXTURE_RELATION_ORDER],
      rowCounts,
      querySha256ByRelation: snapshotPlan.querySha256ByRelation,
      relationDigests,
      aggregateDataHash,
      aggregateSchemaHash: schemaHash,
      aggregateEnvironmentPhysicalStructureHash: sha256Canonical({
        projectRef: PR12_RECOVERY_TARGET.projectRef,
        databaseSystemIdentifier: databaseIdentity.systemIdentifier,
      }),
      rawRowsPersisted: false,
      watermarkColumn: 'public.reservations.updated_at',
      watermarkIncluded: true,
    };
    const snapshotVerification = validateRepresentativeFixtureSnapshot(
      snapshot,
      fixture.planSha256
    );
    const withoutHash = {
      schemaVersion: 1,
      recordType: 'PR12_REPRESENTATIVE_DATA_VALIDATION_RESULT',
      canonicalStep: {
        step: '03',
        name: 'anonymized/representative data validation',
      },
      status: 'PASS',
      projectRef: PR12_RECOVERY_TARGET.projectRef,
      fixturePlanSha256: fixture.planSha256,
      payloadAggregateSha256: compiled.payloadAggregateSha256,
      actorTopologySha256: compiled.actorTopologySha256,
      explicitRows: 83,
      derivedRows: 12,
      verifiedRows: 95,
      actorCount: 7,
      clinics: 4,
      managerAssignments: 1,
      transaction: 'SINGLE_TRANSACTION_FAIL_CLOSED',
      dispatch: dispatched.observation,
      snapshot: {
        commandId: 'PR12-CMD-009',
        verification: snapshotVerification,
        aggregateDataHash,
        aggregateSchemaHash: snapshot.aggregateSchemaHash,
        aggregateEnvironmentPhysicalStructureHash:
          snapshot.aggregateEnvironmentPhysicalStructureHash,
        sourceSnapshotSha256: sha256Canonical(snapshot),
        dispatch: snapshotDispatch.observation,
        rawRowsPersisted: false,
      },
      mutationJournal: {
        intentArtifactSha256,
        resultArtifactSha256,
        durableOutcome: durableMutationOutcome,
      },
      rawRowsPersisted: false,
      rawCredentialsPersisted: false,
      nextStep: '04',
    };
    const result = {
      ...withoutHash,
      evidenceSha256: sha256Canonical(withoutHash),
    };
    const filename = path.join(evidenceDirectory, STEP03_EVIDENCE_FILE);
    writeCanonicalCreateNew(filename, result, 'STEP03_EVIDENCE_CREATE_FAILED');
    hardenPath(repositoryRoot, filename, 'FILE');
    return {
      evidence: result,
      actorPasswords,
      actors: compiled.actorDefinitions,
    };
  } catch (error) {
    const reasonCode =
      error instanceof Error && /^[A-Z0-9_-]+$/u.test(error.message)
        ? error.message
        : 'UNEXPECTED_REPRESENTATIVE_DATA_FAILURE';
    const filename = path.join(evidenceDirectory, STEP03_EVIDENCE_FILE);
    if (!existsSync(filename)) {
      const blockedWithoutHash = {
        schemaVersion: 1,
        recordType: 'PR12_REPRESENTATIVE_DATA_VALIDATION_RESULT',
        canonicalStep: {
          step: '03',
          name: 'anonymized/representative data validation',
        },
        status: 'BLOCK',
        reasonCode,
        projectRef: PR12_RECOVERY_TARGET.projectRef,
        fixturePlanSha256: fixture.planSha256,
        payloadAggregateSha256: compiled.payloadAggregateSha256,
        actorTopologySha256: compiled.actorTopologySha256,
        mutationJournal: {
          intentArtifactSha256,
          resultArtifactSha256,
          durableOutcome: durableMutationOutcome,
        },
        mutationOutcomeUnknown:
          intentArtifactSha256 !== null &&
          !['SUCCEEDED', 'FAILED_DETERMINISTIC'].includes(
            durableMutationOutcome
          ),
        rawRowsPersisted: false,
        rawCredentialsPersisted: false,
      };
      const blocked = {
        ...blockedWithoutHash,
        evidenceSha256: sha256Canonical(blockedWithoutHash),
      };
      writeCanonicalCreateNew(
        filename,
        blocked,
        'STEP03_BLOCK_EVIDENCE_CREATE_FAILED'
      );
      hardenPath(repositoryRoot, filename, 'FILE');
    }
    for (const key of Object.keys(actorPasswords)) actorPasswords[key] = '';
    throw error;
  }
}

function refreshRepresentativeActorCredentials({
  repositoryRoot,
  replayWorkdir,
  psqlPath,
  caPath,
  databasePassword,
  journalDirectory,
  fixtureEvidence,
}) {
  const actorPasswords = Object.fromEntries(
    [
      'tenant-a-admin',
      'tenant-a-clinic-admin',
      'tenant-a-manager',
      'tenant-a-therapist',
      'tenant-a-staff',
      'tenant-b-staff',
      'no-clinic-staff',
    ].map(actorId => [actorId, randomBytes(36).toString('base64url')])
  );
  const runtime = buildRepresentativeActorRuntime(actorPasswords);
  const actorTopologySha256 = runtime.payloadFingerprints.actorTopologySha256;
  const identityRows = runtime.actorDefinitions.map(
    actor =>
      `(${sqlLiteral(actor.id)},${sqlLiteral(actor.email)},${sqlLiteral(actor.role)},${actor.clinicId === null ? 'null' : sqlLiteral(actor.clinicId)})`
  );
  const credentialRows = runtime.actorDefinitions.map(
    actor =>
      `(${sqlLiteral(actor.id)},${sqlLiteral(actor.email)},${sqlLiteral(actor.password)})`
  );
  const sql = `
\\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '120s';
DO $pr12_precondition$
DECLARE matched_users integer;
DECLARE matched_profiles integer;
BEGIN
  SELECT count(*) INTO matched_users
  FROM auth.users AS users
  JOIN (VALUES ${identityRows.join(',')}) AS expected(id,email,role,clinic_id)
    ON users.id=expected.id::uuid AND users.email=expected.email
  WHERE users.email LIKE 'pr12+%@invalid.example';
  SELECT count(*) INTO matched_profiles
  FROM public.profiles AS profiles
  JOIN (VALUES ${identityRows.join(',')}) AS expected(id,email,role,clinic_id)
    ON profiles.id=expected.id::uuid
   AND profiles.user_id=expected.id::uuid
   AND profiles.email=expected.email
   AND profiles.role=expected.role
   AND profiles.clinic_id IS NOT DISTINCT FROM expected.clinic_id::uuid;
  IF matched_users <> 7
     OR matched_profiles <> 7
     OR (SELECT count(*) FROM auth.users WHERE email LIKE 'pr12+%@invalid.example') <> 7
  THEN RAISE EXCEPTION 'PR12_AUTH_FIXTURE_PRECONDITION_FAILED'; END IF;
END $pr12_precondition$;
DO $pr12_update$
DECLARE updated_users integer;
BEGIN
  UPDATE auth.users AS users
  SET encrypted_password=extensions.crypt(expected.password,extensions.gen_salt('bf')),
      updated_at=clock_timestamp()
  FROM (VALUES ${credentialRows.join(',')}) AS expected(id,email,password)
  WHERE users.id=expected.id::uuid AND users.email=expected.email;
  GET DIAGNOSTICS updated_users = ROW_COUNT;
  IF updated_users <> 7
  THEN RAISE EXCEPTION 'PR12_AUTH_FIXTURE_REBIND_COUNT_MISMATCH'; END IF;
END $pr12_update$;
SELECT json_build_object(
  'actorCount',(SELECT count(*) FROM auth.users WHERE email LIKE 'pr12+%@invalid.example'),
  'profileCount',(SELECT count(*) FROM public.profiles WHERE email LIKE 'pr12+%@invalid.example')
)::text;
COMMIT;
`;
  let intentArtifactSha256 = null;
  let resultArtifactSha256 = null;
  let durableOutcome = null;
  try {
    const intentWithoutHash = {
      schemaVersion: 1,
      recordType: 'PR12_ALL_ROLE_SMOKE_AUTH_FIXTURE_REBIND_INTENT',
      commandId: 'PR12-CMD-013',
      operation: 'RUNTIME_AUTH_FIXTURE_REBIND',
      targetProjectRef: PR12_RECOVERY_TARGET.projectRef,
      targetDirectHost: PR12_RECOVERY_TARGET.directHost,
      fixtureEvidenceSha256: fixtureEvidence.evidenceSha256,
      fixturePlanSha256: fixtureEvidence.fixturePlanSha256,
      actorTopologySha256,
      actorCount: 7,
      mutation: true,
      isolatedSyntheticActorsOnly: true,
      dispatchMaximum: 1,
      wrapperRetryCount: 0,
      credentialTransport: 'STDIN_ONLY',
      rawSqlRetained: false,
      actorPasswordValuesPersisted: false,
      secretValuesCaptured: false,
      createdAt: new Date().toISOString(),
    };
    const intentPath = path.join(
      journalDirectory,
      'pr12-cmd-013-auth-rebind-intent.json'
    );
    intentArtifactSha256 = writeCanonicalCreateNew(
      intentPath,
      {
        ...intentWithoutHash,
        intentSha256: sha256Canonical(intentWithoutHash),
      },
      'STEP06_AUTH_REBIND_INTENT_CREATE_FAILED'
    );
    hardenPath(repositoryRoot, intentPath, 'FILE');
    const dispatched = executePsqlInput({
      psqlPath,
      databaseUrl: directDatabaseUrl(caPath),
      databasePassword,
      cwd: replayWorkdir,
      sql,
      timeoutMs: 120_000,
      forbiddenValues: [databasePassword, ...Object.values(actorPasswords)],
    });
    durableOutcome = dispatched.observation.outcome;
    const resultWithoutHash = {
      ...dispatched.observation,
      commandId: 'PR12-CMD-013',
      operation: 'RUNTIME_AUTH_FIXTURE_REBIND',
      intentArtifactSha256,
      actorPasswordValuesPersisted: false,
      secretValuesCaptured: false,
    };
    const resultPath = path.join(
      journalDirectory,
      'pr12-cmd-013-auth-rebind-result.json'
    );
    resultArtifactSha256 = writeCanonicalCreateNew(
      resultPath,
      {
        ...resultWithoutHash,
        observationSha256: sha256Canonical(resultWithoutHash),
      },
      'STEP06_AUTH_REBIND_RESULT_CREATE_FAILED'
    );
    hardenPath(repositoryRoot, resultPath, 'FILE');
    if (durableOutcome !== 'SUCCEEDED') {
      fail(
        durableOutcome === 'UNKNOWN_REMOTE_OUTCOME'
          ? 'UNKNOWN_REMOTE_OUTCOME'
          : 'STEP06_AUTH_REBIND_FAILED'
      );
    }
    const counts = lastJsonLine(
      dispatched.stdout,
      'STEP06_AUTH_REBIND_RESULT_INVALID'
    );
    if (counts.actorCount !== 7 || counts.profileCount !== 7) {
      fail('STEP06_AUTH_REBIND_RESULT_INVALID');
    }
    return {
      evidence: fixtureEvidence,
      actors: runtime.actorDefinitions.map(actor => ({
        actorId: actor.actorId,
        role: actor.role,
        clinicId: actor.clinicId,
        id: actor.id,
        email: actor.email,
      })),
      actorPasswords,
      credentialRebind: {
        commandId: 'PR12-CMD-013',
        operation: 'RUNTIME_AUTH_FIXTURE_REBIND',
        actorCount: 7,
        actorTopologySha256,
        intentArtifactSha256,
        resultArtifactSha256,
        dispatch: dispatched.observation,
        actorPasswordValuesPersisted: false,
      },
    };
  } catch (error) {
    for (const actorId of Object.keys(actorPasswords)) {
      actorPasswords[actorId] = '';
    }
    throw error;
  }
}

function executeHostedTypesParity({
  repositoryRoot,
  evidenceDirectory,
  journalDirectory,
  replayWorkdir,
  gitHead,
  bindingSha256,
  databaseIdentity,
  predecessorAttempt,
  predecessorGeneratedTypesPath,
}) {
  if (
    predecessorAttempt?.status !==
      'GENERATED_TYPES_NORMALIZATION_RECHECK_PENDING' ||
    predecessorAttempt.historicalReasonCode !== 'GENERATED_TYPES_DRIFT' ||
    predecessorAttempt.suspectedClassification !==
      'LOCAL_FORMAT_NORMALIZATION_DEFECT' ||
    predecessorAttempt.hostedTypesGenerationDispatchCount !== 1 ||
    predecessorAttempt.hostedTypesRemoteRedispatchAllowed !== false ||
    predecessorAttempt.hostedTypesRemoteRedispatched !== false ||
    predecessorAttempt.generatedTypesArtifactSha256 !==
      NORMALIZATION_DEFECT_GENERATED_TYPES_SHA256
  ) {
    fail('HOSTED_TYPES_REMOTE_REDISPATCH_FORBIDDEN');
  }
  const runtimeRoot = path.join(replayWorkdir, '.pr12-types-runtime');
  mkdirSync(runtimeRoot, { recursive: false });
  hardenPath(repositoryRoot, runtimeRoot, 'DIRECTORY');
  const formatterRuntimeRoot = path.join(runtimeRoot, 'formatter-runtime');
  mkdirSync(formatterRuntimeRoot, { recursive: false });
  hardenPath(repositoryRoot, formatterRuntimeRoot, 'DIRECTORY');
  const startedAt = new Date().toISOString();
  const generatedTypesPath = path.join(
    runtimeRoot,
    'generated-types-hosted.ts'
  );
  copyExactBytesArtifact({
    repositoryRoot,
    source: predecessorGeneratedTypesPath,
    destination: generatedTypesPath,
    expectedSha256: NORMALIZATION_DEFECT_GENERATED_TYPES_SHA256,
    maximumBytes: 64 * 1024 * 1024,
    code: 'HOSTED_TYPES_PREDECESSOR_COPY_INVALID',
  });
  const committedTypesPath = path.join(repositoryRoot, 'src/types/supabase.ts');
  const committedBefore = readFileSync(committedTypesPath, 'utf8');
  const committedBeforeSha256 = sha256Bytes(
    Buffer.from(committedBefore, 'utf8')
  );
  const formatted = formatGeneratedTypesWithPinnedPrettier({
    repositoryRoot,
    generatedTypesPath,
    formatterRuntimeRoot,
  });
  if (
    formatted.observation.sourceSha256 !==
      NORMALIZATION_DEFECT_GENERATED_TYPES_SHA256 ||
    formatted.observation.sourceByteLength !==
      NORMALIZATION_DEFECT_GENERATED_TYPES_BYTES ||
    formatted.observation.credentialEnvironmentKeys.length !== 0 ||
    formatted.observation.stdin !== 'CLOSED' ||
    formatted.observation.shell !== false ||
    formatted.observation.dispatchCount !== 1 ||
    formatted.observation.wrapperRetryCount !== 0
  ) {
    fail('GENERATED_TYPES_FORMATTER_OBSERVATION_INVALID');
  }
  const comparison = compareHostedTypes({
    generatedTypes: formatted.formattedTypes,
    committedTypes: committedBefore,
    projectRef: PR12_RECOVERY_TARGET.projectRef,
    bindingSha256,
    gitCommit: gitHead,
    databaseSystemIdentifier: databaseIdentity.systemIdentifier,
  });
  const committedAfterSha256 = sha256Bytes(readFileSync(committedTypesPath));
  if (committedAfterSha256 !== committedBeforeSha256) {
    fail('COMMITTED_TYPES_MUTATED');
  }

  const normalizationWithoutHash = {
    schemaVersion: 1,
    recordType: 'PR12_HOSTED_TYPES_NORMALIZATION_RECOVERY',
    commandId: 'PR12-CMD-010',
    projectRef: PR12_RECOVERY_TARGET.projectRef,
    gitHead,
    databaseSystemIdentifier: databaseIdentity.systemIdentifier,
    bindingSha256,
    predecessor: {
      linkSha256: predecessorAttempt.linkSha256,
      historicalReasonCode: predecessorAttempt.historicalReasonCode,
      suspectedClassification: predecessorAttempt.suspectedClassification,
      step04FileSha256: predecessorAttempt.step04FileSha256,
      step04EvidenceSha256: predecessorAttempt.step04EvidenceSha256,
      diagnosticFileSha256: predecessorAttempt.diagnosticFileSha256,
      diagnosticArtifactSha256: predecessorAttempt.diagnosticArtifactSha256,
      generatedTypesArtifactSha256:
        predecessorAttempt.generatedTypesArtifactSha256,
    },
    formatter: formatted.observation,
    comparison,
    correctedClassification: 'LOCAL_FORMAT_NORMALIZATION_DEFECT_VERIFIED',
    sourceArtifactCopiedCreateNew: true,
    hostedTypesGenerationHistoricalDispatchCount: 1,
    hostedTypesRemoteRedispatched: false,
    localFormatterDispatchCount: 1,
    credentialPassedToFormatter: false,
    committedFileMutated: false,
    productionContactCount: 0,
    secretValuesCaptured: false,
  };
  assertSecretFreeEvidence(normalizationWithoutHash, []);
  const normalizationArtifact = {
    ...normalizationWithoutHash,
    normalizationArtifactSha256: sha256Canonical(normalizationWithoutHash),
  };
  const normalizationPath = path.join(
    journalDirectory,
    'generated-types-normalization-recovery.json'
  );
  const normalizationFileSha256 = writeCanonicalCreateNew(
    normalizationPath,
    normalizationArtifact,
    'HOSTED_TYPES_NORMALIZATION_CREATE_FAILED'
  );
  hardenPath(repositoryRoot, normalizationPath, 'FILE');
  const withoutHash = {
    schemaVersion: 1,
    recordType: 'PR12_HOSTED_TYPES_PARITY_RESULT',
    canonicalStep: { step: '04', name: 'types parity' },
    status: 'PASS',
    startedAt,
    completedAt: new Date().toISOString(),
    comparison,
    predecessorNormalizationDefect: {
      linkSha256: predecessorAttempt.linkSha256,
      historicalStep04EvidenceSha256: predecessorAttempt.step04EvidenceSha256,
      historicalDiagnosticArtifactSha256:
        predecessorAttempt.diagnosticArtifactSha256,
    },
    generatedTypesArtifact: {
      artifactSha256: NORMALIZATION_DEFECT_GENERATED_TYPES_SHA256,
      byteLength: NORMALIZATION_DEFECT_GENERATED_TYPES_BYTES,
      copiedCreateNewFromVerifiedPredecessor: true,
      ownerPrivateExternalTemporaryOutput: true,
      repositoryTracked: false,
    },
    normalizationArtifact: {
      artifactSha256: normalizationArtifact.normalizationArtifactSha256,
      fileSha256: normalizationFileSha256,
    },
    correctedClassification: 'LOCAL_FORMAT_NORMALIZATION_DEFECT_VERIFIED',
    formatter: formatted.observation,
    hostedTypesGenerationHistoricalDispatchCount: 1,
    hostedTypesRemoteRedispatched: false,
    remoteCredentialUseCount: 0,
    committedFileMutated: false,
    productionContactCount: 0,
    secretValuesCaptured: false,
    nextStep: '05',
  };
  assertSecretFreeEvidence(withoutHash, []);
  const result = {
    ...withoutHash,
    evidenceSha256: sha256Canonical(withoutHash),
  };
  const filename = path.join(evidenceDirectory, STEP04_EVIDENCE_FILE);
  writeCanonicalCreateNew(filename, result, 'STEP04_EVIDENCE_CREATE_FAILED');
  hardenPath(repositoryRoot, filename, 'FILE');
  return result;
}

function executeAdvisorAfterScan({
  repositoryRoot,
  evidenceDirectory,
  replayWorkdir,
  supabasePath,
  psqlPath,
  caPath,
  databasePassword,
  databaseIdentity,
  bindingSha256,
  advisorBefore,
  journalDirectory,
}) {
  const environment = buildIsolatedChildEnvironment({
    credentialKind: 'database',
    credentialValues: { PGPASSWORD: databasePassword },
    operatingSystemValues: {
      SystemRoot: process.env.SystemRoot ?? 'C:\\Windows',
      TEMP: process.env.TEMP ?? 'C:\\Windows\\Temp',
      TMP: process.env.TMP ?? 'C:\\Windows\\Temp',
      PATH: `${path.dirname(supabasePath)};${path.dirname(psqlPath)}`,
    },
    isolationPaths: {
      supabaseHome: path.join(replayWorkdir, '.pr12-runtime', 'supabase-home'),
      dockerConfig: path.join(replayWorkdir, '.pr12-runtime', 'docker-config'),
    },
  });
  const command = {
    id: 'PR12-CMD-016',
    operation: 'SOURCE_ADVISOR_AFTER_CAPTURE',
    transport: 'DIRECT_POSTGRES_VIA_SUPABASE_CLI',
    executable: supabasePath,
    args: [
      'db',
      'advisors',
      '--db-url',
      directDatabaseUrl(caPath),
      '--type',
      'all',
      '--level',
      'info',
      '--fail-on',
      'error',
      '--output-format',
      'json',
    ],
    cwd: replayWorkdir,
    mutation: false,
    timeoutMs: 300_000,
  };
  const dispatched = runReplayCommand(
    command,
    environment,
    [databasePassword],
    journalDirectory,
    repositoryRoot
  );
  if (dispatched.observation.outcome !== 'SUCCEEDED') {
    fail('PR12_CMD_016_FAILED');
  }
  const findings = parseAdvisorCliJsonOutput(dispatched.stdout);
  const shapeDiagnostic = buildAdvisorFindingShapeDiagnostic(findings);
  const shapeDiagnosticPath = path.join(
    journalDirectory,
    'pr12-cmd-016-shape-diagnostic.json'
  );
  const shapeDiagnosticFileSha256 = writeCanonicalCreateNew(
    shapeDiagnosticPath,
    shapeDiagnostic,
    'ADVISOR_SHAPE_DIAGNOSTIC_CREATE_FAILED'
  );
  hardenPath(repositoryRoot, shapeDiagnosticPath, 'FILE');
  const after = normalizeAdvisorSnapshot({
    schemaVersion: 1,
    commandId: 'PR12-CMD-016',
    bindingSha256,
    projectRef: PR12_RECOVERY_TARGET.projectRef,
    databaseSystemIdentifier: databaseIdentity.systemIdentifier,
    category: 'all',
    capturedAt: dispatched.observation.completedAt,
    findings,
  });
  const diff = diffAdvisorSnapshots(advisorBefore, after);
  const withoutHash = {
    schemaVersion: 1,
    recordType: 'PR12_ADVISOR_SCAN_RESULT',
    canonicalStep: { step: '05', name: 'advisor scan' },
    status: 'PASS',
    before: advisorBefore,
    after,
    diff,
    dispatch: dispatched.observation,
    shapeDiagnostic: {
      diagnosticSha256: shapeDiagnostic.diagnosticSha256,
      fileSha256: shapeDiagnosticFileSha256,
      rawFindingValuesRetained: false,
    },
    rawOutputRetained: false,
    nextStep: '06',
  };
  const result = {
    ...withoutHash,
    evidenceSha256: sha256Canonical(withoutHash),
  };
  const filename = path.join(evidenceDirectory, STEP05_EVIDENCE_FILE);
  writeCanonicalCreateNew(filename, result, 'STEP05_EVIDENCE_CREATE_FAILED');
  hardenPath(repositoryRoot, filename, 'FILE');
  return result;
}

async function executeAllRoleSmoke({
  repositoryRoot,
  evidenceDirectory,
  fixtureResult,
  replayWorkdir,
  psqlPath,
  caPath,
  databasePassword,
  managementAccessToken,
}) {
  const tenantAChild = deterministicUuid('10000000-', 2);
  const tenantBChild = deterministicUuid('10000000-', 4);
  const actorById = new Map(
    fixtureResult.actors.map(actor => [actor.actorId, actor])
  );
  const clinicByContractId = {
    'tenant-a-child': tenantAChild,
    'tenant-b-child': tenantBChild,
  };
  const cases = ALL_ROLE_SMOKE_REST_CASES.map(restCase => {
    const actor = actorById.get(restCase.actorId);
    const clinicId = clinicByContractId[restCase.clinicId];
    const relation = resolveAllRoleSmokeRelation(restCase.relation);
    if (
      !isRecord(actor) ||
      actor.role !== restCase.role ||
      typeof clinicId !== 'string'
    ) {
      fail('ALL_ROLE_DATABASE_RLS_MATRIX_INVALID');
    }
    return {
      id: `db-rls-${restCase.id}`,
      contractCaseId: restCase.id,
      actor,
      clinicId,
      expectedCount: restCase.expectedRows,
      sqlIdentifier: relation.sqlIdentifier,
    };
  });
  if (cases.length !== 14) fail('ALL_ROLE_DATABASE_RLS_MATRIX_INVALID');
  const sql = cases
    .map(item => {
      const claims = JSON.stringify({
        sub: item.actor.id,
        role: 'authenticated',
        app_metadata: {
          role: item.actor.role,
          clinic_id: item.actor.clinicId,
        },
      });
      return `BEGIN TRANSACTION READ ONLY;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = ${sqlLiteral(claims)};
SELECT json_build_object('caseId',${sqlLiteral(item.id)},'count',(SELECT count(*) FROM ${item.sqlIdentifier} WHERE clinic_id=${sqlLiteral(item.clinicId)}))::text;
ROLLBACK;`;
    })
    .join('\n');
  const dispatched = executePsqlInput({
    psqlPath,
    databaseUrl: directDatabaseUrl(caPath),
    databasePassword,
    cwd: replayWorkdir,
    sql: `\\set ON_ERROR_STOP on\n${sql}\n`,
    timeoutMs: 120_000,
    forbiddenValues: [
      databasePassword,
      ...Object.values(fixtureResult.actorPasswords),
    ],
  });
  if (dispatched.observation.outcome !== 'SUCCEEDED') {
    fail('ALL_ROLE_DATABASE_SMOKE_FAILED');
  }
  const observed = dispatched.stdout
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(line => line.startsWith('{'))
    .map(line => JSON.parse(line));
  if (
    observed.length !== cases.length ||
    cases.some(item => {
      const actual = observed.find(value => value.caseId === item.id);
      return !isRecord(actual) || actual.count !== item.expectedCount;
    })
  ) {
    fail('ALL_ROLE_DATABASE_RLS_BOUNDARY_MISMATCH');
  }
  const browserRuntimePreparation = preparePr12BrowserRuntime({
    repositoryRoot,
    runtimeRoot: path.join(replayWorkdir, '.pr12-browser-runtime'),
  });
  const apiKeysUrl = `https://api.supabase.com/v1/projects/${PR12_RECOVERY_TARGET.projectRef}/api-keys?reveal=true`;
  if (recoveryFailureContext !== null) {
    recoveryFailureContext.runtimeApiKeysGetCount = 1;
  }
  const apiKeysResponse = await fetchProviderJson(
    apiKeysUrl,
    managementAccessToken
  );
  const runtimeKeys = selectProjectRuntimeApiKeys(apiKeysResponse.body);
  if (Array.isArray(apiKeysResponse.body)) {
    for (const entry of apiKeysResponse.body) {
      if (isRecord(entry) && typeof entry.api_key === 'string') {
        entry.api_key = '';
      }
    }
  }
  let clientApiKey = runtimeKeys.clientApiKey;
  let serverApiKey = runtimeKeys.serverApiKey;
  let remoteSmoke;
  try {
    remoteSmoke = await executePr12AllRoleSmokeRuntime({
      browserRuntimePreparation,
      projectRef: PR12_RECOVERY_TARGET.projectRef,
      clientApiKey,
      serverApiKey,
      actors: fixtureResult.actors,
      actorPasswords: fixtureResult.actorPasswords,
      fixtureClinicIds: {
        tenantAChild,
        tenantBChild,
      },
      forbiddenValues: [
        databasePassword,
        managementAccessToken,
        clientApiKey,
        serverApiKey,
        ...Object.values(fixtureResult.actorPasswords),
      ],
    });
  } finally {
    clientApiKey = '';
    serverApiKey = '';
  }
  const withoutHash = {
    schemaVersion: 1,
    recordType: 'PR12_ALL_ROLE_SMOKE_RESULT',
    canonicalStep: { step: '06', name: 'all role smoke' },
    status: 'PASS',
    projectRef: PR12_RECOVERY_TARGET.projectRef,
    fixtureEvidenceSha256: fixtureResult.evidence.evidenceSha256,
    completedComponents: [
      'AUTH_SIGN_IN_REFRESH_7_ACTORS',
      'PROFILE_API_7_ACTORS',
      'REST_14_CASES',
      'BROWSER_16_CASES',
      'AUTHENTICATED_DATABASE_RLS_14_CASES',
      'SERVICE_ROLE_CLIENT_BOUNDARY',
    ],
    providerRuntimeApiKeys: {
      getCount: 1,
      responseSha256: apiKeysResponse.bodySha256,
      clientKeyName: runtimeKeys.clientKeyName,
      serverKeyName: runtimeKeys.serverKeyName,
      observedKeyCount: runtimeKeys.observedKeyCount,
      rawResponseRetained: false,
      runtimeValuesPersisted: false,
    },
    authFixtureCredentialRebind: fixtureResult.credentialRebind,
    databaseRlsCases: {
      caseCount: cases.length,
      passCount: cases.length,
      crossTenantFalseAllowCount: 0,
      observationSha256: sha256Canonical(observed),
      rawRowsPersisted: false,
      dispatch: dispatched.observation,
    },
    auth: remoteSmoke.auth,
    rest: remoteSmoke.rest,
    browser: remoteSmoke.browser,
    serviceRoleBoundary: remoteSmoke.serviceRoleBoundary,
    externalSideEffects: {
      boundary: 'ISOLATED_PROJECT_ONLY',
      authSessionFlows: 14,
      applicationLoginFlows: 7,
      productionMutationCount: 0,
      providerMutationCount: 0,
    },
    notRunComponents: ['SERVICE_ROLE_DIRECT_API', 'GRAPHQL', 'MUTATING_CRUD'],
    productionFallbackAllowed: false,
    dotenvFallbackAllowed: false,
    trackedStorageStateFallbackAllowed: false,
    secretValuesCaptured: false,
    rawResponseBodiesPersisted: false,
    nextStep: '07',
    nextStepAuthorized: false,
  };
  assertSecretFreeEvidence(withoutHash, [
    databasePassword,
    managementAccessToken,
    runtimeKeys.clientApiKey,
    runtimeKeys.serverApiKey,
    ...Object.values(fixtureResult.actorPasswords),
  ]);
  const result = {
    ...withoutHash,
    evidenceSha256: sha256Canonical(withoutHash),
  };
  const filename = path.join(evidenceDirectory, STEP06_EVIDENCE_FILE);
  writeCanonicalCreateNew(filename, result, 'STEP06_EVIDENCE_CREATE_FAILED');
  hardenPath(repositoryRoot, filename, 'FILE');
  return result;
}

function assertSecretFreeEvidence(value, forbiddenValues) {
  const serialized = canonicalJson(value);
  const lower = serialized.toLowerCase();
  if (
    forbiddenValues.some(
      secret => secret.length > 0 && serialized.includes(secret)
    ) ||
    /bearer\s+[a-z0-9._~+/=-]+/iu.test(serialized) ||
    /postgres(?:ql)?:\/\/[^/\s"'@]+:[^@\s"']+@/iu.test(serialized) ||
    lower.includes('ciphertextbase64') ||
    lower.includes('databasepassword') ||
    lower.includes('managementaccesstoken')
  ) {
    fail('SECRET_BEARING_EVIDENCE');
  }
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  if (process.platform !== 'win32') fail('WINDOWS_REQUIRED');
  assertNoAmbientCredentials();
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..'
  );
  if (
    realpathSync.native(process.cwd()) !== realpathSync.native(repositoryRoot)
  ) {
    fail('REPOSITORY_CWD_INVALID');
  }
  const gitHead = captureCleanGitHead(repositoryRoot);
  const credentialPath = resolveExistingFile(
    args['--credential-config'],
    'CREDENTIAL_CONFIG_INVALID'
  );
  const journalDirectory = resolveExistingDirectory(
    args['--action003-journal'],
    'ACTION003_JOURNAL_INVALID'
  );
  const action003EvidenceDirectory = resolveExistingDirectory(
    args['--action003-evidence-directory'],
    'ACTION003_EVIDENCE_INVALID'
  );
  const supabasePath = resolveExistingFile(
    args['--supabase'],
    'SUPABASE_TOOLCHAIN_INVALID'
  );
  const psqlPath = resolveExistingFile(args['--psql'], 'PSQL_INVALID');
  const historical = verifyProvisioningEvidenceDirectory(
    action003EvidenceDirectory
  );
  const sourceCredentialSnapshot = readCanonicalJson(
    credentialPath,
    'CREDENTIAL_CONFIG_INVALID'
  );
  if (
    historical.outcome !== 'PARTIAL_FAILURE' ||
    historical.manifestSha256 !== EXPECTED_ACTION003_MANIFEST_SHA256 ||
    historical.trustedResult?.partialFailureState !==
      'PROVIDER_RESPONSE_INVALID' ||
    historical.trustedResult?.createPostAttemptCount !== 1 ||
    historical.trustedProvider?.createResponse?.safeProjection?.projectRef !==
      PR12_RECOVERY_TARGET.projectRef
  ) {
    fail('ACTION003_HISTORICAL_EVIDENCE_MISMATCH');
  }
  const paths = assertExternalSiblingPaths(
    repositoryRoot,
    journalDirectory,
    action003EvidenceDirectory
  );
  const predecessorAttempt = assertPredecessorPreContactAbort(
    repositoryRoot,
    paths
  );
  const brokerAbortAttempt = assertPredecessorCredentialBrokerAbort(
    repositoryRoot,
    paths,
    predecessorAttempt
  );
  const advisorAbortAttempt = assertPredecessorAdvisorParserAbort(
    repositoryRoot,
    paths,
    [predecessorAttempt, brokerAbortAttempt]
  );
  const catalogGapAttempt = assertPredecessorCatalogGapAbort(
    repositoryRoot,
    paths,
    [predecessorAttempt, brokerAbortAttempt, advisorAbortAttempt]
  );
  const priorAttempts = [
    predecessorAttempt,
    brokerAbortAttempt,
    advisorAbortAttempt,
    catalogGapAttempt,
  ];
  const typesDriftSnapshot = assertPredecessorTypesDriftAbort(
    repositoryRoot,
    paths,
    priorAttempts
  );
  const typesDriftAttempt = typesDriftSnapshot.link;
  const preNormalizationAttempts = [...priorAttempts, typesDriftAttempt];
  const normalizationDefectSnapshot = assertPredecessorTypesNormalizationDefect(
    repositoryRoot,
    paths,
    preNormalizationAttempts
  );
  const normalizationDefectAttempt = normalizationDefectSnapshot.link;
  const preAdvisorShapeAttempts = [
    ...preNormalizationAttempts,
    normalizationDefectAttempt,
  ];
  const advisorShapeDefectSnapshot = assertPredecessorAdvisorShapeDefect(
    repositoryRoot,
    paths,
    preAdvisorShapeAttempts
  );
  const advisorShapeDefectAttempt = advisorShapeDefectSnapshot.link;
  const advisorShapeDefectEvidenceDirectory =
    advisorShapeDefectSnapshot.sourceDirectory;
  const predecessorStep02 = advisorShapeDefectSnapshot.step02;
  const predecessorAttempts = [
    ...preAdvisorShapeAttempts,
    advisorShapeDefectAttempt,
  ];
  createOwnerPrivateDirectory(repositoryRoot, paths.recoveryJournal);
  createOwnerPrivateDirectory(repositoryRoot, paths.recoveryEvidence);
  createOwnerPrivateDirectory(repositoryRoot, paths.replayWorkdir);
  recoveryFailureContext = {
    repositoryRoot,
    journalDirectory: paths.recoveryJournal,
    evidenceDirectory: paths.recoveryEvidence,
    gitHead,
    startedAt: new Date().toISOString(),
    projectStateGetCount: 0,
    computeAddonGetCount: 0,
    publicCaGetCount: 0,
    runtimeApiKeysGetCount: 0,
    directDatabaseConnectionCount: 0,
    providerBodySha256: null,
    predecessorAttempts,
  };
  const runtimeCredential = createRuntimeCredentialConfiguration(
    repositoryRoot,
    sourceCredentialSnapshot,
    paths.recoveryJournal
  );
  const resources = validateDpapiCredentialResources(
    runtimeCredential.value,
    repositoryRoot
  );
  const toolchain = observeAndAssertPinnedToolchainFiles({
    supabasePath,
    psqlPath,
  });
  const toolchainProjection = projectPinnedToolchainObservation(toolchain);
  const claimSnapshot = createRecoveryClaim({
    repositoryRoot,
    journalDirectory: paths.recoveryJournal,
    gitHead,
    action003Evidence: action003EvidenceDirectory,
    action003Verification: historical,
    credentialConfigurationSha256: runtimeCredential.sha256,
    predecessorAttempts,
  });
  const claim = claimSnapshot.claim;
  const credentialLeaseExpiresAt = new Date(
    Date.now() + CREDENTIAL_LEASE_MS
  ).toISOString();
  let managementAccessToken = '';
  let databasePassword = '';
  let fixtureResult = null;
  try {
    const credentials = retrieveClaimBoundCredentials({
      mode: 'ISOLATED_PROJECT_CONTINUATION',
      bindingMaterialSha256: claim.bindingMaterialSha256,
      derivedExecutionBindingSha256: claim.derivedExecutionBindingSha256,
      payloadSha256: claim.payloadSha256,
      claimSha256: claimSnapshot.sha256,
      credentialConfigurationSha256: runtimeCredential.sha256,
      credentialConfiguration: runtimeCredential.value,
      journalDirectory: paths.recoveryJournal,
      journalDirectoryPathSha256: windowsPathFingerprint(paths.recoveryJournal),
      evidenceParentDirectory: paths.recoveryEvidence,
      evidenceParentDirectoryPathSha256: windowsPathFingerprint(
        paths.recoveryEvidence
      ),
      approvalExpiresAt: credentialLeaseExpiresAt,
      resources,
    });
    managementAccessToken = credentials.managementAccessToken;
    databasePassword = credentials.databasePassword;
    if (
      managementAccessToken.length < 20 ||
      databasePassword.length < 32 ||
      managementAccessToken === databasePassword
    ) {
      fail('RUNTIME_CREDENTIAL_INVALID');
    }

    const caPath = path.join(paths.recoveryEvidence, CA_FILE);
    copyExactBytesArtifact({
      repositoryRoot,
      source: path.join(advisorShapeDefectEvidenceDirectory, CA_FILE),
      destination: caPath,
      expectedSha256: PINNED_CA_SHA256,
      maximumBytes: 16 * 1024,
      code: 'CA_BUNDLE_HASH_MISMATCH',
    });
    recoveryFailureContext.directDatabaseConnectionCount = 1;
    const database = captureDatabaseIdentity({
      psqlPath,
      caPath,
      databasePassword,
    });
    if (
      database.status !== 'REACHABLE' ||
      database.projectRef !== PR12_RECOVERY_TARGET.projectRef ||
      database.systemIdentifier !== '7666052913346410626' ||
      database.connectionMode !== 'DIRECT' ||
      database.tls?.verifiedMode !== 'verify-full'
    ) {
      fail('RECOVERY_DATABASE_IDENTITY_MISMATCH');
    }
    const identityWithoutHash = {
      schemaVersion: 1,
      recordType: 'PR12_EXISTING_PROJECT_CYCLE8_DATABASE_IDENTITY',
      projectRef: PR12_RECOVERY_TARGET.projectRef,
      database,
      predecessorStep01EvidenceSha256:
        TYPES_DRIFT_EVIDENCE_SHA256[STEP01_EVIDENCE_FILE],
      predecessorAdvisorShapeDefectLinkSha256:
        advisorShapeDefectAttempt.linkSha256,
      toolchain: toolchainProjection,
      credentialBoundary: {
        brokerProtocolMode: 'ISOLATED_PROJECT_CONTINUATION',
        retrieval: 'RUNTIME_ONLY_CAPTURED_BINARY_CHILD_ENV_ONLY',
        credentialLeaseExpiresAt,
      },
      productionBoundary: {
        productionProjectRef: 'qnanuoqveidwvacvbhqp',
        productionCredentialAccessCount: 0,
        productionDatabaseContactCount: 0,
      },
      rawOutputsRetained: false,
      secretValuesCaptured: false,
    };
    assertSecretFreeEvidence(identityWithoutHash, [
      managementAccessToken,
      databasePassword,
    ]);
    const identity = {
      ...identityWithoutHash,
      identityEvidenceSha256: sha256Canonical(identityWithoutHash),
    };
    const identityPath = path.join(
      paths.recoveryJournal,
      'pr12-cycle8-database-identity.json'
    );
    writeCanonicalCreateNew(
      identityPath,
      identity,
      'CYCLE8_DATABASE_IDENTITY_CREATE_FAILED'
    );
    hardenPath(repositoryRoot, identityPath, 'FILE');
    const evidence = copyExactCanonicalArtifact({
      repositoryRoot,
      source: path.join(
        advisorShapeDefectEvidenceDirectory,
        STEP01_EVIDENCE_FILE
      ),
      destination: path.join(paths.recoveryEvidence, STEP01_EVIDENCE_FILE),
      expectedSha256:
        ADVISOR_SHAPE_DEFECT_STEP_FILE_SHA256[STEP01_EVIDENCE_FILE],
      code: 'STEP01_PREDECESSOR_COPY_INVALID',
    });
    const replay = copyExactCanonicalArtifact({
      repositoryRoot,
      source: path.join(
        advisorShapeDefectEvidenceDirectory,
        STEP02_EVIDENCE_FILE
      ),
      destination: path.join(paths.recoveryEvidence, STEP02_EVIDENCE_FILE),
      expectedSha256:
        ADVISOR_SHAPE_DEFECT_STEP_FILE_SHA256[STEP02_EVIDENCE_FILE],
      code: 'STEP02_PREDECESSOR_COPY_INVALID',
    });
    const fixtureEvidence = copyExactCanonicalArtifact({
      repositoryRoot,
      source: path.join(
        advisorShapeDefectEvidenceDirectory,
        STEP03_EVIDENCE_FILE
      ),
      destination: path.join(paths.recoveryEvidence, STEP03_EVIDENCE_FILE),
      expectedSha256:
        ADVISOR_SHAPE_DEFECT_STEP_FILE_SHA256[STEP03_EVIDENCE_FILE],
      code: 'STEP03_PREDECESSOR_COPY_INVALID',
    });
    process.stdout.write(
      `${canonicalJson({
        step: '01',
        canonicalStep: 'staging clone/isolated project',
        result: 'PASS',
        projectRef: PR12_RECOVERY_TARGET.projectRef,
        computeTier: evidence.decision.computeTier,
        performanceQualificationDeferred: true,
        predecessorEvidenceLinked: true,
        nextStep: '02',
      })}\n`
    );
    process.stdout.write(
      `${canonicalJson({
        step: '02',
        canonicalStep: 'full migration replay',
        result: 'PASS',
        nextStep: '03',
        evidenceSha256: replay.evidenceSha256,
        migrationApplyRedispatched: false,
        productionContactCount: 0,
        postCount: 0,
      })}\n`
    );
    process.stdout.write(
      `${canonicalJson({
        step: '03',
        canonicalStep: 'anonymized/representative data validation',
        result: 'PASS',
        nextStep: '04',
        evidenceSha256: fixtureEvidence.evidenceSha256,
        representativeFixtureRedispatched: false,
      })}\n`
    );
    const types = copyExactCanonicalArtifact({
      repositoryRoot,
      source: path.join(
        advisorShapeDefectEvidenceDirectory,
        STEP04_EVIDENCE_FILE
      ),
      destination: path.join(paths.recoveryEvidence, STEP04_EVIDENCE_FILE),
      expectedSha256:
        ADVISOR_SHAPE_DEFECT_STEP_FILE_SHA256[STEP04_EVIDENCE_FILE],
      code: 'STEP04_PREDECESSOR_COPY_INVALID',
    });
    process.stdout.write(
      `${canonicalJson({
        step: '04',
        canonicalStep: 'types parity',
        result: 'PASS',
        nextStep: '05',
        evidenceSha256: types.evidenceSha256,
        hostedTypesRemoteRedispatched: false,
        localNormalizationRedispatched: false,
      })}\n`
    );
    const advisor = executeAdvisorAfterScan({
      repositoryRoot,
      evidenceDirectory: paths.recoveryEvidence,
      replayWorkdir: paths.replayWorkdir,
      supabasePath,
      psqlPath,
      caPath,
      databasePassword,
      databaseIdentity: database,
      bindingSha256: predecessorStep02.advisorBefore.bindingSha256,
      advisorBefore: predecessorStep02.advisorBefore,
      journalDirectory: paths.recoveryJournal,
    });
    process.stdout.write(
      `${canonicalJson({
        step: '05',
        canonicalStep: 'advisor scan',
        result: 'PASS',
        nextStep: '06',
        evidenceSha256: advisor.evidenceSha256,
      })}\n`
    );
    fixtureResult = refreshRepresentativeActorCredentials({
      repositoryRoot,
      replayWorkdir: paths.replayWorkdir,
      psqlPath,
      caPath,
      databasePassword,
      journalDirectory: paths.recoveryJournal,
      fixtureEvidence,
    });
    const smoke = await executeAllRoleSmoke({
      repositoryRoot,
      evidenceDirectory: paths.recoveryEvidence,
      fixtureResult,
      replayWorkdir: paths.replayWorkdir,
      psqlPath,
      caPath,
      databasePassword,
      managementAccessToken,
    });
    const terminalWithoutHash = {
      schemaVersion: 1,
      recordType: 'PR12_EXISTING_PROJECT_CONTINUATION_TERMINAL',
      actionId: RECOVERY_ACTION_ID,
      status: 'OWNER_AUTHORIZED_SCOPE_COMPLETE',
      completedAt: new Date().toISOString(),
      gitHead,
      projectRef: PR12_RECOVERY_TARGET.projectRef,
      completedCanonicalSteps: ['01', '02', '03', '04', '05', '06'],
      blockedCanonicalStep: null,
      nextCanonicalStep: '07',
      nextCanonicalStepAuthorized: false,
      step01EvidenceSha256: evidence.evidenceSha256,
      step02EvidenceSha256: replay.evidenceSha256,
      step03EvidenceSha256: fixtureResult.evidence.evidenceSha256,
      step04EvidenceSha256: types.evidenceSha256,
      step05EvidenceSha256: advisor.evidenceSha256,
      step06EvidenceSha256: smoke.evidenceSha256,
      predecessorAttempts,
      newProjectPostAttemptCount: 0,
      productionContactCount: 0,
      secretValuesCaptured: false,
    };
    const terminal = {
      ...terminalWithoutHash,
      terminalSha256: sha256Canonical(terminalWithoutHash),
    };
    const terminalPath = path.join(paths.recoveryJournal, TERMINAL_FILE);
    writeCanonicalCreateNew(
      terminalPath,
      terminal,
      'RECOVERY_TERMINAL_CREATE_FAILED'
    );
    hardenPath(repositoryRoot, terminalPath, 'FILE');
    process.stdout.write(
      `${canonicalJson({
        step: '06',
        canonicalStep: 'all role smoke',
        result: 'PASS',
        nextStep: '07',
        nextStepAuthorized: false,
        evidenceSha256: smoke.evidenceSha256,
      })}\n`
    );
    return;
  } finally {
    if (fixtureResult !== null) {
      for (const actorId of Object.keys(fixtureResult.actorPasswords)) {
        fixtureResult.actorPasswords[actorId] = '';
      }
    }
    managementAccessToken = '';
    databasePassword = '';
  }
}

main().catch(error => {
  const code =
    error instanceof RecoveryExecutionError ||
    (error instanceof Error && /^[A-Z0-9_]+$/u.test(error.message))
      ? error.message
      : 'UNEXPECTED_RECOVERY_FAILURE';
  if (recoveryFailureContext !== null) {
    try {
      const context = recoveryFailureContext;
      const step01Path = path.join(
        context.evidenceDirectory,
        STEP01_EVIDENCE_FILE
      );
      const step01EvidenceAlreadyExisted = existsSync(step01Path);
      if (!step01EvidenceAlreadyExisted) {
        const blockedWithoutHash = {
          schemaVersion: 1,
          recordType: 'PR12_EXISTING_ISOLATED_PROJECT_RECOVERY_RESULT',
          canonicalStep: {
            step: '01',
            name: 'staging clone/isolated project',
          },
          status: 'BLOCK',
          reasonCode: code,
          startedAt: context.startedAt,
          completedAt: new Date().toISOString(),
          target: {
            projectRef: PR12_RECOVERY_TARGET.projectRef,
            organizationId: PR12_RECOVERY_TARGET.organizationId,
            region: PR12_RECOVERY_TARGET.region,
          },
          providerBodySha256: context.providerBodySha256,
          predecessorAttempts: context.predecessorAttempts,
          remoteContacts: {
            projectStateGetCount: context.projectStateGetCount,
            computeAddonGetCount: context.computeAddonGetCount,
            publicCaGetCount: context.publicCaGetCount,
            runtimeApiKeysGetCount: context.runtimeApiKeysGetCount,
            directDatabaseConnectionCount:
              context.directDatabaseConnectionCount,
            postCount: 0,
            retryCount: 0,
          },
          productionContactCount: 0,
          rawProviderBodiesRetained: false,
          rawPathsRetained: false,
          secretValuesCaptured: false,
        };
        const blocked = {
          ...blockedWithoutHash,
          evidenceSha256: sha256Canonical(blockedWithoutHash),
        };
        writeCanonicalCreateNew(
          step01Path,
          blocked,
          'BLOCK_EVIDENCE_CREATE_FAILED'
        );
        hardenPath(context.repositoryRoot, step01Path, 'FILE');
      }
      const canonicalArtifacts = [
        ['01', 'staging clone/isolated project', STEP01_EVIDENCE_FILE],
        ['02', 'full migration replay', STEP02_EVIDENCE_FILE],
        [
          '03',
          'anonymized/representative data validation',
          STEP03_EVIDENCE_FILE,
        ],
        ['04', 'types parity', STEP04_EVIDENCE_FILE],
        ['05', 'advisor scan', STEP05_EVIDENCE_FILE],
        ['06', 'all role smoke', STEP06_EVIDENCE_FILE],
      ];
      const completedCanonicalSteps = [];
      let blockedCanonicalStep = null;
      for (const [step, name, filename] of canonicalArtifacts) {
        const artifactPath = path.join(context.evidenceDirectory, filename);
        if (!existsSync(artifactPath)) {
          blockedCanonicalStep = step;
          const blockWithoutHash = {
            schemaVersion: 1,
            recordType: 'PR12_CANONICAL_STEP_BLOCK_RESULT',
            canonicalStep: { step, name },
            status: 'BLOCK',
            reasonCode: code,
            completedAt: new Date().toISOString(),
            projectRef: PR12_RECOVERY_TARGET.projectRef,
            runtimeApiKeysGetCount: context.runtimeApiKeysGetCount,
            productionContactCount: 0,
            rawOutputsRetained: false,
            secretValuesCaptured: false,
          };
          const block = {
            ...blockWithoutHash,
            evidenceSha256: sha256Canonical(blockWithoutHash),
          };
          writeCanonicalCreateNew(
            artifactPath,
            block,
            'CANONICAL_BLOCK_EVIDENCE_CREATE_FAILED'
          );
          hardenPath(context.repositoryRoot, artifactPath, 'FILE');
          break;
        }
        const artifact = readCanonicalJson(
          artifactPath,
          'CANONICAL_EVIDENCE_INVALID'
        ).value;
        if (artifact.status === 'PASS') {
          completedCanonicalSteps.push(step);
          continue;
        }
        blockedCanonicalStep = step;
        break;
      }
      const terminalPath = path.join(context.journalDirectory, TERMINAL_FILE);
      if (!existsSync(terminalPath)) {
        const terminalWithoutHash = {
          schemaVersion: 1,
          recordType: 'PR12_EXISTING_PROJECT_CONTINUATION_TERMINAL',
          actionId: RECOVERY_ACTION_ID,
          status: 'BLOCK',
          reasonCode: code,
          completedAt: new Date().toISOString(),
          gitHead: context.gitHead,
          projectRef: PR12_RECOVERY_TARGET.projectRef,
          completedCanonicalSteps,
          blockedCanonicalStep: blockedCanonicalStep ?? '01',
          predecessorAttempts: context.predecessorAttempts,
          newProjectPostAttemptCount: 0,
          productionContactCount: 0,
          secretValuesCaptured: false,
        };
        const terminal = {
          ...terminalWithoutHash,
          terminalSha256: sha256Canonical(terminalWithoutHash),
        };
        writeCanonicalCreateNew(
          terminalPath,
          terminal,
          'BLOCK_TERMINAL_CREATE_FAILED'
        );
        hardenPath(context.repositoryRoot, terminalPath, 'FILE');
      }
    } catch {
      // Preserve the original fail-closed reason on stderr.
    }
  }
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
});
