# Pointer restoration coverage

Authoritative queue and checkpoints: `/home/mk/projects/installation_scripts/tmp/workflow/68758d42fec543c68a29582948603087.md`.

The disappearance was a persisted off setting after the prior drag repair, not a broken enable operation. The saved public regression uses the installed CLI in a fresh isolated home. A passing pre-repair run protects the existing restoration path; the actual desktop baseline was `ptr off 100px`.

| Operation | Rejection class | Rejected public input | Validation owner | Expected rejection | Test and immediate public observations |
| --- | --- | --- | --- | --- | --- |
| ptr on/off | Success and repeat | None | wsi_set_pointer_enabled | None | tests/test_installer.sh installed command block: off then on, repeat on, each status independently on/off 95px |
| ptr | Unknown operation | lwsi unknown | wsi_pointer_command | Nonzero status | Same block, immediately ptr on 95px |
| ptr | Extra operand | lwsi ptr 95 extra | wsi_pointer_command | Nonzero status | Same block, immediately ptr on 95px |
| ptr on | Extra operand while off | lwsi ptr on extra | wsi_pointer_command | Nonzero status | Same block, immediately ptr off 95px, then successful restore on 95px |
| ptr length | Conversion | lwsi ptr '95 px'; lwsi ptr nope | wsi_validate_pointer_length | Nonzero status | Installed invalid-argument loop, immediately ptr on 95px after EACH rejection |
| ptr length | Range | lwsi ptr 0; -1; 1001 | wsi_validate_pointer_length | Nonzero status | Same loop, immediately ptr on 95px after EACH rejection |

A missing ptr action and bare lwsi intentionally query status. No missing-operand rejection applies. No new command or numeric policy is introduced. The isolated installer suite also preserves the saved enabled choice across --default and validates installed source copies. The live repair uses `~/.local/bin/lwsi ptr on` and reads back status and extension state.

## Wider stroke coverage

Feature 2 uses `node tests/test_pointer_paint.cjs` through the actual PointerContent paint interface: a 1×6 uploaded texture has exactly four teal rows (alpha 153), transparent boundary rows, a centered six-pixel GPU rectangle, and a 167px reserved radius at maximum length 100. Assertions derive these values from the requested four-pixel visible stroke plus one transparent row at each edge.

Retained visibility rejection blocks are inline in the same script: excessive cursor warp yields zero paint children, the next anchored frame recovers; entering the focused window yields zero children; absent target yields zero children and no pointer query. Every case observes the paint result immediately. Repeated movement preserves a single texture upload. The retained test_pointer.cjs separately exercises settings-off, overview, workspace, minimized/no-focus visibility and both drag-target pick exclusions. Numeric/command rejection behavior is unchanged and retained in test_installer.sh. Rendering accepts no command operands and introduces no new domain validation.
