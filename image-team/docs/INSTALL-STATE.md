# INSTALL-STATE

The system now distinguishes:
- install-blocked
- install-planned
- (future) install-running
- (future) install-complete

At the moment, the runner can automatically move a job into `install-planned` when:
- installPossible = true
- selected engine = Comfy
- a derived install plan was generated from local recipe files

Current observed state on this machine:
- installState = install-planned
- systemState = recipe-only
