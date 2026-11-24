# Design docs

- [Creature resting poses](creature-rest.md): creatures rest like their real animal (cling, lie, hang) and switch between resting and roaming.
- [Model pipeline reliability](model-pipeline.md): why the judge verdict depends on the draw, what is fixed, and the open plan ([epic lifeboard#15](https://github.com/BlakeCrowther/lifeboard/issues/15)).
- [Cloud model pipeline](cloud-pipeline.md): feasibility spike for running the weekly model pipeline in a cloud session VM instead of the owner's Mac.
- [Board store and model storage](model-storage.md): each board keeps its own page source, models, data and preferences in its board store (today the artifact), apart from the toolkit, so updates never wipe them.
- [User customization and updates](user-customization.md): users change their board through settings, house rules or its own source; toolkit updates arrive as proposals that `update-board` merges.
- [UI components](ui-components.md): whether to move the page to React with Radix or shadcn/ui, and a stepwise path.
