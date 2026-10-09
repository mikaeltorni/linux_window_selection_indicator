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
