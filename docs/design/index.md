# Design docs

- [Creature resting poses](creature-rest.md): creatures rest like their real animal (cling, lie, hang) and switch between resting and roaming.
- [Model pipeline reliability](model-pipeline.md): why the judge verdict depends on the draw, what is fixed, and the open plan ([epic lifeboard#15](https://github.com/BlakeCrowther/lifeboard/issues/15)).
- [Cloud model pipeline](cloud-pipeline.md): feasibility spike for running the weekly model pipeline in a cloud session VM instead of the owner's Mac.
- [Model storage in the board store](model-storage.md): each board's models and preferences live in its own board store (today the artifact), apart from the code, so updates never wipe them.
