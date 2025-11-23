const http = require("http");
const { URL, URLSearchParams } = require("url");

const PORT = process.env.PORT || 3001;
const CLICKUP_API_TOKEN = process.env.CLICKUP_API_TOKEN;
const API_BASE = "https://api.clickup.com/api/v2";

function send(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => (data += chunk));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function requireToken() {
  if (!CLICKUP_API_TOKEN) {
    throw new Error("Missing CLICKUP_API_TOKEN");
  }
}

function cleanPayload(obj) {
  return Object.entries(obj || {})
    .filter(([, v]) => v !== undefined && v !== null)
    .reduce((acc, [k, v]) => {
      acc[k] = v;
      return acc;
    }, {});
}

async function callClickUp(method, path, body, query) {
  requireToken();
  const qs = query ? `?${new URLSearchParams(query).toString()}` : "";
  const response = await fetch(`${API_BASE}${path}${qs}`, {
    method,
    headers: {
      Authorization: CLICKUP_API_TOKEN,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (err) {
    json = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(`ClickUp ${response.status}`);
    error.details = json;
    throw error;
  }

  return json;
}

const tools = {
  async get_space({ spaceId }) {
    if (!spaceId) throw new Error("spaceId is required");
    return callClickUp("GET", `/space/${spaceId}`);
  },

  async get_list({ listId }) {
    if (!listId) throw new Error("listId is required");
    return callClickUp("GET", `/list/${listId}`);
  },

  async get_task({ taskId }) {
    if (!taskId) throw new Error("taskId is required");
    return callClickUp("GET", `/task/${taskId}`);
  },

  async create_task(input) {
    const { listId, name, description, status, assignees, dueDate, priority, tags, custom_fields } = input || {};
    if (!listId) throw new Error("listId is required");
    if (!name) throw new Error("name is required");

    const payload = cleanPayload({
      name,
      description,
      status,
      assignees,
      due_date: dueDate,
      priority,
      tags,
      custom_fields
    });

    return callClickUp("POST", `/list/${listId}/task`, payload);
  },

  async update_task(input) {
    const { taskId, name, description, status, priority, dueDate, tags, custom_fields, assignees, parent } = input || {};
    if (!taskId) throw new Error("taskId is required");

    const payload = cleanPayload({
      name,
      description,
      status,
      priority,
      due_date: dueDate,
      tags,
      custom_fields,
      assignees,
      parent
    });

    return callClickUp("PUT", `/task/${taskId}`, payload);
  },

  async comment_task({ taskId, text }) {
    if (!taskId) throw new Error("taskId is required");
    if (!text) throw new Error("text is required");
    return callClickUp("POST", `/task/${taskId}/comment`, { comment_text: text });
  },

  async change_status({ taskId, status }) {
    if (!taskId) throw new Error("taskId is required");
    if (!status) throw new Error("status is required");
    return callClickUp("PUT", `/task/${taskId}`, { status });
  },

  async assign_user({ taskId, assignees }) {
    if (!taskId) throw new Error("taskId is required");
    if (!Array.isArray(assignees) || !assignees.length) throw new Error("assignees array is required");
    return callClickUp("PUT", `/task/${taskId}`, { assignees });
  },

  async search_tasks({ teamId, query, page, order_by, reverse }) {
    const resolvedTeamId = teamId || process.env.CLICKUP_TEAM_ID;
    if (!resolvedTeamId) throw new Error("teamId or CLICKUP_TEAM_ID is required");
    const qs = cleanPayload({ page, order_by, reverse, query });
    return callClickUp("GET", `/team/${resolvedTeamId}/task`, undefined, qs);
  }
};

function listTools() {
  return Object.keys(tools).map(name => ({ name }));
}

async function handleInvoke(toolName, input) {
  const tool = tools[toolName];
  if (!tool) throw new Error(`Unknown tool: ${toolName}`);
  return tool(input || {});
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === "GET" && url.pathname === "/tools") {
      return send(res, 200, { tools: listTools() });
    }

    if (req.method === "POST" && url.pathname.startsWith("/tools/")) {
      const toolName = url.pathname.split("/")[2];
      const body = await parseBody(req);
      const result = await handleInvoke(toolName, body.input || body);
      return send(res, 200, { result });
    }

    send(res, 404, { error: "Not Found" });
  } catch (err) {
    send(res, 400, { error: err.message, details: err.details });
  }
});

server.listen(PORT, () => {
  console.log(`clickup-mcp-server listening on port ${PORT}`);
});
