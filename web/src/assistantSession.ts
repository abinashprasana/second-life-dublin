/** A cancelled or superseded request can never replace a newer answer. */
export class AssistantSession {
  private revision = 0
  private controller: AbortController | null = null
  begin() {
    this.cancel()
    const revision = this.revision
    const controller = new AbortController()
    this.controller = controller
    return { signal: controller.signal, current: () => this.revision === revision && !controller.signal.aborted }
  }
  cancel() { this.revision++; this.controller?.abort(); this.controller = null }
}
