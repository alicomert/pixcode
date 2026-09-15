import { accessFor, requireAccess, requireAdmin } from '../auth.js'
import { httpError } from '../util/http.js'
import { browseDirectories, cloneProject, createProject, currentProject, grantExternalWorkspace, listProjects, openWorkspace, selectProject } from '../projects.js'

function visibleProjects(ctx) {
  const access = requireAccess(ctx)
  const projects = listProjects()
  return access.projects ? projects.filter((project) => access.projects.has(project.id)) : projects
}

export const projectChannel = {
  ops: {
    list: (ctx) => visibleProjects(ctx),
    current: (ctx) => {
      requireAccess(ctx)
      const current = currentProject()
      const access = accessFor(ctx)
      if (access?.projects && current && !access.projects.has(current.id)) return null
      return current
    },
    create: (ctx, { name } = {}) => { requireAdmin(ctx); return createProject(name) },
    select: (ctx, { id } = {}) => {
      const access = requireAccess(ctx)
      if (access.projects && !access.projects.has(String(id || ''))) throw httpError(403, 'project is not assigned to this account')
      return selectProject(id)
    },
    open: (ctx, { path } = {}) => { requireAdmin(ctx); return openWorkspace(path) },
    clone: (ctx, { url, name } = {}) => { requireAdmin(ctx); return cloneProject(url, name) },
    browse: (ctx, { path } = {}) => { requireAdmin(ctx); return browseDirectories(path) },
    grant: (ctx, { path } = {}) => { requireAdmin(ctx); return grantExternalWorkspace(path) }
  }
}
