import { createProject, currentProject, listProjects, selectProject } from '../projects.js'

export const projectChannel = {
  ops: {
    list: () => listProjects(),
    current: () => currentProject(),
    create: (_ctx, { name } = {}) => createProject(name),
    select: (_ctx, { id } = {}) => selectProject(id)
  }
}
