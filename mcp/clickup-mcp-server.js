const http = require('http')
const { URL, URLSearchParams } = require('url')

const PORT = process.env.PORT || 3001
const CLICKUP_API_TOKEN = process.env.CLICKUP_API_TOKEN || process.env.CLICKUP_API_KEY
const CLICKUP_TEAM_ID = process.env.CLICKUP_TEAM_ID
const API_BASE = 'https://api.clickup.com/api/v2'

function send(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => (data += chunk))
    req.on('end', () => {
      if (!data) return resolve({})
      try {
        resolve(JSON.parse(data))
      } catch (err) {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

function requireToken() {
  if (!CLICKUP_API_TOKEN) {
    throw new Error('Missing CLICKUP_API_TOKEN')
  }
}

function resolveTeamId(explicitTeamId) {
  const resolved = explicitTeamId || CLICKUP_TEAM_ID
  if (!resolved) throw new Error('team_id or CLICKUP_TEAM_ID is required')
  return resolved
}

function cleanPayload(obj) {
  return Object.entries(obj || {}).reduce((acc, [key, value]) => {
    if (value === undefined || value === null) return acc
    if (Array.isArray(value) && value.length === 0) return acc
    acc[key] = value
    return acc
  }, {})
}

function normalizeQuery(query) {
  const cleaned = cleanPayload(query)
  const params = new URLSearchParams()
  Object.entries(cleaned).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach(v => params.append(key, v))
    } else {
      params.append(key, value)
    }
  })
  return params
}

async function callClickUp(method, path, { body, query } = {}) {
  requireToken()
  const qs = query ? `?${normalizeQuery(query).toString()}` : ''
  const response = await fetch(`${API_BASE}${path}${qs}`, {
    method,
    headers: {
      Authorization: CLICKUP_API_TOKEN,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  })

  const text = await response.text()
  let json
  try {
    json = text ? JSON.parse(text) : {}
  } catch (err) {
    json = { raw: text }
  }

  if (!response.ok) {
    const error = new Error(`ClickUp ${response.status}`)
    error.details = json
    throw error
  }

  return json
}

async function fetchSpacesWithHierarchy(teamId, includeArchived, filters) {
  const spacesResp = await callClickUp('GET', `/team/${teamId}/space`, {
    query: { archived: includeArchived }
  })
  const spaces = spacesResp.spaces || []
  const results = []

  for (const space of spaces) {
    const matchesSpace = !filters.space_name || space.name?.toLowerCase().includes(filters.space_name.toLowerCase())
    if (!matchesSpace) continue

    const foldersResp = await callClickUp('GET', `/space/${space.id}/folder`, {
      query: { archived: includeArchived }
    })
    const listsResp = await callClickUp('GET', `/space/${space.id}/list`, {
      query: { archived: includeArchived }
    })

    const folders = (foldersResp.folders || []).map(folder => {
      const folderMatches =
        !filters.folder_name || folder.name?.toLowerCase().includes(filters.folder_name.toLowerCase())
      const filteredLists = (folder.lists || []).filter(list => {
        if (!filters.list_name) return true
        return list.name?.toLowerCase().includes(filters.list_name.toLowerCase())
      })
      return {
        id: folder.id,
        name: folder.name,
        lists: filteredLists
      }
    })

    const filteredFolders = folders.filter(folder => {
      if (!filters.folder_name) return true
      return folder.name?.toLowerCase().includes(filters.folder_name.toLowerCase()) || (folder.lists || []).length > 0
    })

    const spaceLevelLists = (listsResp.lists || []).filter(list => {
      if (!filters.list_name) return true
      return list.name?.toLowerCase().includes(filters.list_name.toLowerCase())
    })

    results.push({
      id: space.id,
      name: space.name,
      folders: filteredFolders,
      lists: spaceLevelLists
    })
  }

  return { team_id: teamId, spaces: results }
}

async function fetchMembers(teamId) {
  const teamsResp = await callClickUp('GET', '/team')
  const teams = teamsResp.teams || []
  const team = teams.find(t => String(t.id) === String(teamId))
  if (!team) {
    throw new Error(`Team ${teamId} not found for provided token`)
  }
  return {
    team_id: teamId,
    name: team.name,
    members: team.members || [],
    guests: team.guests || []
  }
}

const toolDefinitions = [
  {
    name: 'get_workspace_hierarchy',
    description: 'Recupera Spaces, Folders e Lists do workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: { type: 'string', description: 'Opcional, usa CLICKUP_TEAM_ID se omitido' },
        space_name: { type: 'string', description: 'Filtro parcial por nome do Space' },
        folder_name: { type: 'string', description: 'Filtro parcial por nome do Folder' },
        list_name: { type: 'string', description: 'Filtro parcial por nome da List' },
        include_archived: { type: 'boolean', description: 'Incluir itens arquivados' }
      }
    },
    outputSchema: {
      type: 'object',
      properties: {
        team_id: { type: 'string' },
        spaces: { type: 'array', items: { type: 'object' } }
      }
    },
    handler: async input => {
      const teamId = resolveTeamId(input.team_id)
      return fetchSpacesWithHierarchy(teamId, Boolean(input.include_archived), {
        space_name: input.space_name,
        folder_name: input.folder_name,
        list_name: input.list_name
      })
    }
  },
  {
    name: 'get_list',
    description: 'Busca detalhes de uma List específica.',
    inputSchema: {
      type: 'object',
      required: ['list_id'],
      properties: {
        list_id: { type: 'string', description: 'ID da List' }
      }
    },
    outputSchema: { type: 'object' },
    handler: async input => {
      if (!input.list_id) throw new Error('list_id is required')
      return callClickUp('GET', `/list/${input.list_id}`)
    }
  },
  {
    name: 'create_task',
    description: 'Cria tarefa em uma List.',
    inputSchema: {
      type: 'object',
      required: ['list_id', 'name'],
      properties: {
        list_id: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'string' },
        assignees: { type: 'array', items: { type: 'string' } },
        due_date: { type: 'integer', description: 'Unix ms' },
        priority: { type: 'integer' },
        tags: { type: 'array', items: { type: 'string' } }
      }
    },
    outputSchema: { type: 'object' },
    handler: async input => {
      if (!input.list_id) throw new Error('list_id is required')
      if (!input.name) throw new Error('name is required')
      const payload = cleanPayload({
        name: input.name,
        description: input.description,
        status: input.status,
        assignees: input.assignees,
        due_date: input.due_date,
        priority: input.priority,
        tags: input.tags
      })
      return callClickUp('POST', `/list/${input.list_id}/task`, { body: payload })
    }
  },
  {
    name: 'get_task',
    description: 'Recupera detalhes completos de uma tarefa.',
    inputSchema: {
      type: 'object',
      required: ['task_id'],
      properties: {
        task_id: { type: 'string' }
      }
    },
    outputSchema: { type: 'object' },
    handler: async input => {
      if (!input.task_id) throw new Error('task_id is required')
      return callClickUp('GET', `/task/${input.task_id}`)
    }
  },
  {
    name: 'update_task',
    description: 'Atualiza campos de uma tarefa (nome, descrição, status, assignees, due_date, tags).',
    inputSchema: {
      type: 'object',
      required: ['task_id'],
      properties: {
        task_id: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'string' },
        assignees: { type: 'array', items: { type: 'string' } },
        due_date: { type: 'integer' },
        priority: { type: 'integer' },
        tags: { type: 'array', items: { type: 'string' } }
      }
    },
    outputSchema: { type: 'object' },
    handler: async input => {
      if (!input.task_id) throw new Error('task_id is required')
      const payload = cleanPayload({
        name: input.name,
        description: input.description,
        status: input.status,
        assignees: input.assignees,
        due_date: input.due_date,
        priority: input.priority,
        tags: input.tags
      })
      if (Object.keys(payload).length === 0) throw new Error('No fields provided to update')
      return callClickUp('PUT', `/task/${input.task_id}`, { body: payload })
    }
  },
  {
    name: 'get_workspace_tasks',
    description: 'Lista tarefas do workspace ou de uma List com filtros básicos.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: { type: 'string', description: 'Opcional, usa CLICKUP_TEAM_ID se omitido' },
        list_id: { type: 'string', description: 'Se fornecido, filtra pela List' },
        assignees: { type: 'array', items: { type: 'string' }, description: 'IDs de usuários' },
        statuses: { type: 'array', items: { type: 'string' } },
        include_closed: { type: 'boolean' },
        page: { type: 'integer' },
        order_by: { type: 'string' },
        reverse: { type: 'boolean' },
        due_date_gt: { type: 'integer', description: 'Timestamp ms' },
        due_date_lt: { type: 'integer', description: 'Timestamp ms' }
      }
    },
    outputSchema: { type: 'object' },
    handler: async input => {
      const listId = input.list_id
      const query = cleanPayload({
        assignees: input.assignees,
        statuses: input.statuses,
        include_closed: input.include_closed,
        page: input.page,
        order_by: input.order_by,
        reverse: input.reverse,
        due_date_gt: input.due_date_gt,
        due_date_lt: input.due_date_lt
      })

      if (listId) {
        return callClickUp('GET', `/list/${listId}/task`, { query })
      }

      const teamId = resolveTeamId(input.team_id)
      return callClickUp('GET', `/team/${teamId}/task`, { query })
    }
  },
  {
    name: 'get_task_comments',
    description: 'Lista comentários de uma tarefa.',
    inputSchema: {
      type: 'object',
      required: ['task_id'],
      properties: {
        task_id: { type: 'string' }
      }
    },
    outputSchema: { type: 'object' },
    handler: async input => {
      if (!input.task_id) throw new Error('task_id is required')
      return callClickUp('GET', `/task/${input.task_id}/comment`)
    }
  },
  {
    name: 'create_task_comment',
    description: 'Cria um comentário em uma tarefa.',
    inputSchema: {
      type: 'object',
      required: ['task_id', 'comment_text'],
      properties: {
        task_id: { type: 'string' },
        comment_text: { type: 'string' },
        notify_all: { type: 'boolean', description: 'Notificar todos os seguidores da tarefa' }
      }
    },
    outputSchema: { type: 'object' },
    handler: async input => {
      if (!input.task_id) throw new Error('task_id is required')
      if (!input.comment_text) throw new Error('comment_text is required')
      const payload = cleanPayload({
        comment_text: input.comment_text,
        notify_all: input.notify_all
      })
      return callClickUp('POST', `/task/${input.task_id}/comment`, { body: payload })
    }
  },
  {
    name: 'get_workspace_members',
    description: 'Lista membros e convidados do workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: { type: 'string', description: 'Opcional, usa CLICKUP_TEAM_ID se omitido' }
      }
    },
    outputSchema: { type: 'object' },
    handler: async input => {
      const teamId = resolveTeamId(input.team_id)
      return fetchMembers(teamId)
    }
  },
  {
    name: 'find_member_by_name',
    description: 'Busca membro por nome ou email.',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', description: 'Parte do nome ou email' },
        team_id: { type: 'string', description: 'Opcional, usa CLICKUP_TEAM_ID se omitido' }
      }
    },
    outputSchema: { type: 'object' },
    handler: async input => {
      if (!input.query) throw new Error('query is required')
      const teamId = resolveTeamId(input.team_id)
      const roster = await fetchMembers(teamId)
      const term = input.query.toLowerCase()
      const matches = (roster.members || []).filter(member => {
        const name = member.username || member.user?.username || ''
        const email = member.email || member.user?.email || ''
        return name.toLowerCase().includes(term) || email.toLowerCase().includes(term)
      })
      return { team_id: roster.team_id, matches }
    }
  }
]

const toolHandlers = Object.fromEntries(toolDefinitions.map(def => [def.name, def.handler]))

function listTools() {
  return toolDefinitions.map(({ name, description, inputSchema, outputSchema }) => ({
    name,
    description,
    inputSchema,
    outputSchema
  }))
}

async function handleInvoke(toolName, input) {
  const handler = toolHandlers[toolName]
  if (!handler) throw new Error(`Unknown tool: ${toolName}`)
  return handler(input || {})
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)

  try {
    if (req.method === 'GET' && url.pathname === '/tools') {
      return send(res, 200, { tools: listTools() })
    }

    if (req.method === 'POST' && url.pathname.startsWith('/tools/')) {
      const toolName = url.pathname.split('/')[2]
      const body = await parseBody(req)
      const result = await handleInvoke(toolName, body.input || body)
      return send(res, 200, { result })
    }

    send(res, 404, { error: 'Not Found' })
  } catch (err) {
    send(res, 400, { error: err.message, details: err.details })
  }
})

server.listen(PORT, () => {
  console.log(`clickup-mcp-server listening on port ${PORT}`)
})
