// Diagnostic only: preserve Jest's default results while identifying the active suite.
class AuditProgressReporter {
  onTestStart(test) {
    process.stderr.write(`[audit-suite-start] ${test.path}\n`);
  }
}
module.exports = AuditProgressReporter;
