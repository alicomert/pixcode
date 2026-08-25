import { browseDirectories, cloneProject, createProject, currentProject, listProjects, openWorkspace, selectProject } from '../projects.js'

export const projectChannel = {
  ops: {
    list: () => listProjects(),
    current: () => currentProject(),
    create: (_ctx, { name } = {}) => createProject(name),
    select: (_ctx, { id } = {}) => selectProject(id),
    open: (_ctx, { path } = {}) => openWorkspace(path),
    clone: (_ctx, { url, name } = {}) => cloneProject(url, name),
    browse: (_ctx, { path } = {}) => browseDirectories(path)
  }
}
