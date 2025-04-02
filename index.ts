#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";

/**
 * 이 MCP 서버는 TwelveLabs API를 호출하기 위한 예시입니다.
 * 실제 TwelveLabs API 엔드포인트와 파라미터는
 * https://docs.twelvelabs.io/v1.3/docs/guides 를 참고하여 수정하세요.
 *
 * 기능:
 *  1) create_index       - 인덱스 생성
 *  2) upload_videos      - 영상(YouTube URL) 업로드
 *  3) search_videos      - 텍스트 기반 검색
 *  4) generate_text      - 특정 영상으로부터 텍스트(자막, 요약 등) 생성
 */

// MCP 서버 생성
const server = new Server(
  {
    name: "twelvelabs-video-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// API Key 체크
const TWELVELABS_API_KEY = process.env.TWELVELABS_API_KEY || "";
if (!TWELVELABS_API_KEY || TWELVELABS_API_KEY === "") {
  console.error("Error: TWELVELABS_API_KEY environment variable is required.");
  process.exit(1);
}

// TwelveLabs API base URL 예시
const BASE_URL = "https://api.twelvelabs.io/v1.3";


const models: { name: "pegasus1.2" | "marengo2.7"; options: ("visual" | "audio")[]; }[] = [
  {
    name: "marengo2.7", // 문서 기반으로 모델 변경 (marengo2.7이 검색용)
    options: ["visual", "audio"],
  },
  {
    name: "pegasus1.2", // 문서 기반으로 모델 변경 (pegasus1.2가 텍스트 생성용)
    options: ["visual", "audio"],
  },
];

// 도구 목록
const CREATE_INDEX_TOOL: Tool = {
  name: "create_index",
  description:
    "Creates a new index in TwelveLabs. Useful before uploading videos or performing searches. " +
    "Input: { indexName: string }",
  inputSchema: {
    type: "object",
    properties: {
      indexName: { type: "string", description: "Name of the new index" },
    },
    required: ["indexName"]
  }
};

const LIST_INDEXES_TOOL: Tool = {
  name: "list_indexes",
  description:
    "Lists all indexes in your TwelveLabs account. " +
    "Input: { page?: number; pageLimit?: number; sortBy?: string; sortOption?: string; indexName?: string }",
  inputSchema: {
    type: "object",
    properties: {
      page: { type: "number", description: "Page number (default: 1)" },
      pageLimit: { type: "number", description: "Number of items per page (default: 10, max: 50)" },
      sortBy: { 
        type: "string", 
        description: "Field to sort by (created_at or updated_at)",
        enum: ["created_at", "updated_at"] 
      },
      sortOption: { 
        type: "string", 
        description: "Sort direction (asc or desc)",
        enum: ["asc", "desc"] 
      },
      indexName: { type: "string", description: "Filter by index name" }
    }
  }
};

const GET_INDEX_TOOL: Tool = {
  name: "get_index",
  description:
    "Retrieves details of a specific index. " +
    "Input: { indexId: string }",
  inputSchema: {
    type: "object",
    properties: {
      indexId: { type: "string", description: "ID of the index to retrieve" }
    },
    required: ["indexId"]
  }
};

const UPDATE_INDEX_TOOL: Tool = {
  name: "update_index",
  description:
    "Updates the name of a specific index. " +
    "Input: { indexId: string; indexName: string }",
  inputSchema: {
    type: "object",
    properties: {
      indexId: { type: "string", description: "ID of the index to update" },
      indexName: { type: "string", description: "New name for the index" }
    },
    required: ["indexId", "indexName"]
  }
};

const DELETE_INDEX_TOOL: Tool = {
  name: "delete_index",
  description:
    "Deletes a specific index and all videos within it. This action cannot be undone. " +
    "Input: { indexId: string }",
  inputSchema: {
    type: "object",
    properties: {
      indexId: { type: "string", description: "ID of the index to delete" }
    },
    required: ["indexId"]
  }
};

const LIST_TASKS_TOOL: Tool = {
  name: "list_tasks",
  description:
    "Lists all video indexing tasks in your account. " +
    "Input: { page?: number; pageLimit?: number; sortBy?: string; sortOption?: string; indexId?: string; status?: string[] }",
  inputSchema: {
    type: "object",
    properties: {
      page: { type: "number", description: "Page number (default: 1)" },
      pageLimit: { type: "number", description: "Number of items per page (default: 10, max: 50)" },
      sortBy: { 
        type: "string", 
        description: "Field to sort by (created_at or updated_at)",
        enum: ["created_at", "updated_at"] 
      },
      sortOption: { 
        type: "string", 
        description: "Sort direction (asc or desc)",
        enum: ["asc", "desc"] 
      },
      indexId: { type: "string", description: "Filter by index ID" },
      status: { 
        type: "array", 
        items: { 
          type: "string", 
          enum: ["ready", "uploading", "validating", "pending", "queued", "indexing", "failed"] 
        },
        description: "Filter by task status" 
      }
    }
  }
};

const GET_TASK_TOOL: Tool = {
  name: "get_task",
  description:
    "Retrieves details of a specific video indexing task. " +
    "Input: { taskId: string }",
  inputSchema: {
    type: "object",
    properties: {
      taskId: { type: "string", description: "ID of the task to retrieve" }
    },
    required: ["taskId"]
  }
};

const DELETE_TASK_TOOL: Tool = {
  name: "delete_task",
  description:
    "Deletes a specific video indexing task. You can only delete tasks with status 'ready' or 'failed'. " +
    "Input: { taskId: string }",
  inputSchema: {
    type: "object",
    properties: {
      taskId: { type: "string", description: "ID of the task to delete" }
    },
    required: ["taskId"]
  }
};

const UPLOAD_VIDEOS_TOOL: Tool = {
  name: "upload_videos",
  description:
    "Uploads videos to an existing TwelveLabs index from direct URLs or local file paths. " +
    "Input: { indexId: string; url?: string; filePath?: string; enableVideoStream?: boolean }",
  inputSchema: {
    type: "object",
    properties: {
      indexId: { type: "string", description: "Target index ID" },
      url: { type: "string", description: "Direct URL to the video file (not YouTube)" },
      filePath: { type: "string", description: "Local file path to the video (not implemented yet)" },
      enableVideoStream: { type: "boolean", description: "Enable video streaming (default: true)" }
    },
    required: ["indexId"]
  }
};

const SEARCH_VIDEOS_TOOL: Tool = {
  name: "search_videos",
  description:
    "Searches videos within a specific index using text queries. " +
    "Input: { indexId: string; query: string; options?: string[]; operator?: string; limit?: number }",
  inputSchema: {
    type: "object",
    properties: {
      indexId: { type: "string", description: "Index ID to search" },
      query: { type: "string", description: "Search query text" },
      options: {
        type: "array",
        items: { type: "string", enum: ["visual", "audio"] },
        description: "Search options: visual, audio, or both"
      },
      operator: {
        type: "string",
        enum: ["and", "or"],
        description: "Operator to use when multiple options are specified"
      },
      limit: { type: "number", description: "Number of results to retrieve" }
    },
    required: ["indexId", "query"]
  }
};

const GENERATE_TEXT_TOOL: Tool = {
  name: "generate_text",
  description:
    "Generates text (transcription or summary) from a specified video. " +
    "Input: { videoId: string; mode?: string; prompt?: string; temperature?: number } " +
    "mode: 'transcript' or 'summary' (or custom prompt).",
  inputSchema: {
    type: "object",
    properties: {
      videoId: { type: "string", description: "ID of the target video" },
      mode: { type: "string", description: "transcript or summary", default: "transcript" },
      prompt: { type: "string", description: "Custom prompt for text generation (optional)" },
      temperature: { 
        type: "number", 
        description: "Controls randomness (0.0-1.0)",
        minimum: 0,
        maximum: 1,
        default: 0.2
      }
    },
    required: ["videoId"]
  }
};

const GENERATE_GIST_TOOL: Tool = {
  name: "generate_gist",
  description:
    "Generates titles, topics, and hashtags for your videos. " +
    "Input: { videoId: string; types: string[] } " +
    "types: Array of 'title', 'topic', 'hashtag'",
  inputSchema: {
    type: "object",
    properties: {
      videoId: { type: "string", description: "ID of the target video" },
      types: { 
        type: "array",
        items: { 
          type: "string", 
          enum: ["title", "topic", "hashtag"] 
        },
        description: "Types of gist to generate" 
      }
    },
    required: ["videoId", "types"]
  }
};

const GENERATE_SUMMARY_TOOL: Tool = {
  name: "generate_summary",
  description:
    "Generates summaries, chapters, or highlights for your videos. " +
    "Input: { videoId: string; type: string; prompt?: string; temperature?: number } " +
    "type: 'summary', 'chapter', or 'highlight'",
  inputSchema: {
    type: "object",
    properties: {
      videoId: { type: "string", description: "ID of the target video" },
      type: { 
        type: "string", 
        enum: ["summary", "chapter", "highlight"],
        description: "Type of summary to generate" 
      },
      prompt: { 
        type: "string", 
        description: "Optional prompt to guide the summarization" 
      },
      temperature: { 
        type: "number", 
        description: "Controls randomness (0.0-1.0)",
        minimum: 0,
        maximum: 1,
        default: 0.2
      }
    },
    required: ["videoId", "type"]
  }
};

// 새로운 도구 추가: 비디오 임포트 상태 조회 도구
const GET_IMPORT_STATUS_TOOL: Tool = {
  name: "get_import_status",
  description:
    "Retrieves the current status for each video from a specified integration and index. " +
    "Input: { integrationId: string; indexId: string }",
  inputSchema: {
    type: "object",
    properties: {
      integrationId: { type: "string", description: "Integration ID" },
      indexId: { type: "string", description: "Index ID" }
    },
    required: ["integrationId", "indexId"]
  }
};

const GET_IMPORT_LOGS_TOOL: Tool = {
  name: "get_import_logs",
  description:
    "Retrieves the import logs for a specified integration. " +
    "Input: { integrationId: string }",
  inputSchema: {
    type: "object",
    properties: {
      integrationId: { type: "string", description: "Integration ID" }
    },
    required: ["integrationId"]
  }
};

const IMPORT_VIDEOS_TOOL: Tool = {
  name: "import_videos",
  description:
    "Imports videos from an integration into an index. " +
    "Input: { integrationId: string; indexId: string; incrementalImport?: boolean; retryFailed?: boolean }",
  inputSchema: {
    type: "object",
    properties: {
      integrationId: { type: "string", description: "Integration ID" },
      indexId: { type: "string", description: "Index ID" },
      incrementalImport: { type: "boolean", description: "Whether to perform incremental import (default: true)" },
      retryFailed: { type: "boolean", description: "Whether to retry failed uploads (default: false)" }
    },
    required: ["integrationId", "indexId"]
  }
};

// Tool 목록 요청 핸들러
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      CREATE_INDEX_TOOL, 
      LIST_INDEXES_TOOL,
      GET_INDEX_TOOL,
      UPDATE_INDEX_TOOL,
      DELETE_INDEX_TOOL,
      UPLOAD_VIDEOS_TOOL, 
      IMPORT_VIDEOS_TOOL,
      GET_IMPORT_STATUS_TOOL,
      GET_IMPORT_LOGS_TOOL,
      LIST_TASKS_TOOL,
      GET_TASK_TOOL,
      DELETE_TASK_TOOL,
      SEARCH_VIDEOS_TOOL, 
      GENERATE_TEXT_TOOL,
      GENERATE_GIST_TOOL,
      GENERATE_SUMMARY_TOOL
    ],
  };
});

// Tool 실행 핸들러
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  if (!args) {
    return {
      content: [{ type: "text", text: "No arguments provided" }],
      isError: true
    };
  }

  try {
    switch (name) {
      case "create_index": {
        const { indexName } = args as { indexName: string };
        const res = await createIndex(indexName);
        return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
      }
      case "list_indexes": {
        const { page, pageLimit, sortBy, sortOption, indexName } = args as {
          page?: number;
          pageLimit?: number;
          sortBy?: string;
          sortOption?: string;
          indexName?: string;
        };
        const res = await listIndexes(page, pageLimit, sortBy, sortOption, indexName);
        return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
      }
      case "get_index": {
        const { indexId } = args as { indexId: string };
        const res = await getIndex(indexId);
        return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
      }
      case "update_index": {
        const { indexId, indexName } = args as { indexId: string; indexName: string };
        const res = await updateIndex(indexId, indexName);
        return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
      }
      case "delete_index": {
        const { indexId } = args as { indexId: string };
        const res = await deleteIndex(indexId);
        return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
      }
      case "upload_videos": {
        const { indexId, url, filePath, enableVideoStream = true } = args as {
          indexId: string;
          url?: string;
          filePath?: string;
          enableVideoStream?: boolean;
        };
        if (!url && !filePath) {
          return {
            content: [{ type: "text", text: "Either url or filePath is required" }],
            isError: true
          };
        }
        const res = await uploadVideos(indexId, url, filePath, enableVideoStream);
        return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
      }
      case "list_tasks": {
        const { page, pageLimit, sortBy, sortOption, indexId, status } = args as {
          page?: number;
          pageLimit?: number;
          sortBy?: string;
          sortOption?: string;
          indexId?: string;
          status?: string[];
        };
        const res = await listTasks(page, pageLimit, sortBy, sortOption, indexId, status);
        return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
      }
      case "get_task": {
        const { taskId } = args as { taskId: string };
        const res = await getTask(taskId);
        return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
      }
      case "delete_task": {
        const { taskId } = args as { taskId: string };
        const res = await deleteTask(taskId);
        return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
      }
      case "search_videos": {
        const { indexId, query, options = ["visual", "audio"], operator = "or", limit = 10 } =
          args as {
            indexId: string;
            query: string;
            options?: string[];
            operator?: string;
            limit?: number;
          };
        const res = await searchVideos(indexId, query, options, operator, limit);
        return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
      }
      case "generate_text": {
        const { videoId, mode = "transcript", prompt, temperature = 0.2 } = args as { 
          videoId: string; 
          mode?: string;
          prompt?: string;
          temperature?: number;
        };
        const res = await generateTextFromVideo(videoId, mode, prompt, temperature);
        return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
      }
      case "generate_gist": {
        const { videoId, types } = args as { 
          videoId: string; 
          types: string[];
        };
        const res = await generateGist(videoId, types);
        return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
      }
      case "generate_summary": {
        const { videoId, type, prompt, temperature = 0.2 } = args as { 
          videoId: string; 
          type: string;
          prompt?: string;
          temperature?: number;
        };
        const res = await generateSummary(videoId, type, prompt, temperature);
        return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
      }
      case "import_videos": {
        const { integrationId, indexId, incrementalImport = true, retryFailed = false } = args as {
          integrationId: string;
          indexId: string;
          incrementalImport?: boolean;
          retryFailed?: boolean;
        };
        const res = await importVideos(integrationId, indexId, incrementalImport, retryFailed);
        return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
      }
      case "get_import_status": {
        const { integrationId, indexId } = args as {
          integrationId: string;
          indexId: string;
        };
        const res = await getImportStatus(integrationId, indexId);
        return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
      }
      case "get_import_logs": {
        const { integrationId } = args as {
          integrationId: string;
        };
        const res = await getImportLogs(integrationId);
        return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
      }
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true
        };
    }
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${String(error)}` }],
      isError: true
    };
  }
});

// 실제 TwelveLabs API 호출 부분
async function createIndex(indexName: string) {
  try {
    // SDK 대신 직접 REST API 호출로 변경
    const url = `${BASE_URL}/indexes`;
    
    const body = {
      index_name: indexName,
      models: [
        {
          model_name: "marengo2.7",
          model_options: ["visual", "audio"]
        }
      ],
      addons: ["thumbnail"]
    };
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": TWELVELABS_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      throw new Error(`인덱스 생성 실패: ${response.status}`);
    }
    
    const result = await response.json() as any;
    console.error(`인덱스가 생성되었습니다: id=${result._id || result.id} name=${result.index_name || indexName}`);
    
    return {
      status: 'success',
      indexId: result._id || result.id,
      indexName: result.index_name || indexName,
      message: "인덱스가 성공적으로 생성되었습니다"
    };
  } catch (error) {
    console.error('인덱스 생성 중 오류:', error);
    throw error;
  }
}

async function uploadVideos(indexId: string, url?: string, filePath?: string, enableVideoStream: boolean = true) {
  try {
    // API 엔드포인트
    const apiUrl = `${BASE_URL}/tasks`;
    
    // FormData 객체 생성
    const form = new FormData();
    form.append('index_id', indexId);
    
    // 스트리밍 옵션 추가
    form.append('enable_video_stream', enableVideoStream.toString());
    
    if (url) {
      form.append('video_url', url);
      console.error(`URL로 비디오 업로드: ${url}`);
    } else if (filePath) {
      // 현재는 URL만 지원하고 로컬 파일 업로드는 구현되지 않음
      throw new Error("파일 업로드는 아직 지원되지 않습니다. URL을 사용해주세요.");
    } else {
      throw new Error("URL 또는 파일 경로가 필요합니다.");
    }

    // 요청 옵션 설정 (multipart/form-data 형식)
    const options = {
      method: 'POST',
      headers: {
        'x-api-key': TWELVELABS_API_KEY
      },
      body: form
    };
    
    console.error(`API 요청: ${apiUrl}`);
    
    const response = await fetch(apiUrl, options);
    const responseText = await response.text();
    
    console.error(`API 응답 상태: ${response.status}`);
    
    if (!response.ok) {
      console.error(`API 응답 에러: ${responseText}`);
      throw new Error(`비디오 업로드 실패: ${response.status}, 응답: ${responseText}`);
    }
    
    // 응답이 유효한 JSON인지 확인
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      console.error(`JSON 파싱 오류: ${e}`);
      throw new Error(`응답을 파싱할 수 없습니다: ${responseText}`);
    }
    
    console.error(`태스크 생성됨: id=${result._id || result.id}, video_id=${result.video_id}`);
    
    return {
      status: 'success',
      taskId: result._id || result.id,
      videoId: result.video_id,
      indexId: indexId,
      message: "비디오 업로드 작업이 시작되었습니다."
    };
  } catch (error) {
    console.error('비디오 업로드 중 오류:', error);
    throw error;
  }
}

async function searchVideos(
  indexId: string, 
  queryText: string, 
  options: string[] = ["visual", "audio"], 
  operator: string = "or",
  limit: number = 10
) {
  try {
    // SDK 직접 사용 대신 REST API 호출로 변경
    const url = `${BASE_URL}/indexes/${indexId}/search`;
    
    const body = {
      query: queryText,
      search_options: {
        query_mode: "semantic",
        search_type: options.includes("visual") ? "visual" : "conversation",
      },
      group_by: "video",
      page_limit: limit
    };
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": TWELVELABS_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      throw new Error(`검색 실패: ${response.status}`);
    }
    
    const result = await response.json() as any;
    console.error(`검색 완료: ${result.data?.length || 0}개 결과 찾음`);
    
    return {
      status: 'success',
      totalCount: result.data?.length || 0,
      results: result.data || []
    };
  } catch (error) {
    console.error('비디오 검색 중 오류:', error);
    throw error;
  }
}

async function generateTextFromVideo(videoId: string, mode: string = "transcript", prompt?: string, temperature: number = 0.2) {
  try {
    // 엔드포인트 확인
    const url = `${BASE_URL}/generate`;
    
    // 프롬프트 구성 (mode에 따라 다른 프롬프트 생성)
    let finalPrompt = prompt;
    if (!finalPrompt) {
      if (mode === "transcript") {
        finalPrompt = "Generate a complete transcript of this video in detail.";
      } else if (mode === "summary") {
        finalPrompt = "Generate a concise summary of this video highlighting the main points and key takeaways.";
      } else {
        finalPrompt = mode; // 사용자가 직접 제공한 mode를 프롬프트로 사용
      }
    }
    
    // 요청 본문 구성 - 문서 기반으로 정확한 필드 사용
    const body = {
      video_id: videoId,
      prompt: finalPrompt,
      temperature: temperature,
      stream: false // 스트리밍 미사용
    };
    
    console.error(`텍스트 생성 요청: ${JSON.stringify(body)}`);
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": TWELVELABS_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    
    const responseText = await response.text();
    console.error(`API 응답 상태: ${response.status}, 응답 본문: ${responseText.substring(0, 500)}...`); // 응답 본문 일부만 로깅
    
    if (!response.ok) {
      throw new Error(`텍스트 생성 실패: ${response.status}, 응답: ${responseText}`);
    }
    
    // 응답이 유효한 JSON인지 확인
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      console.error(`JSON 파싱 오류: ${e}`);
      throw new Error(`응답을 파싱할 수 없습니다: ${responseText}`);
    }
    
    console.error(`텍스트 생성 완료: ${videoId}, 응답 구조: ${Object.keys(result).join(", ")}`);
    
    // API 문서 기반 필드 처리 - 응답에 id, data, usage 필드 포함됨
    return {
      status: 'success',
      text: result.data || "", // API 문서에 따라 data 필드에 실제 생성된 텍스트가 있음
      id: result.id || "",
      usage: result.usage || {},
      videoId,
      mode,
      temperature // 응답에 사용된 temperature 값도 포함
    };
  } catch (error) {
    console.error('텍스트 생성 중 오류:', error);
    throw error;
  }
}

// 새로 추가한 함수들
async function listIndexes(
  page?: number,
  pageLimit?: number,
  sortBy?: string,
  sortOption?: string,
  indexName?: string
) {
  try {
    // 쿼리 파라미터 구성
    const queryParams = new URLSearchParams();
    if (page) queryParams.append('page', page.toString());
    if (pageLimit) queryParams.append('page_limit', pageLimit.toString());
    if (sortBy) queryParams.append('sort_by', sortBy);
    if (sortOption) queryParams.append('sort_option', sortOption);
    if (indexName) queryParams.append('index_name', indexName);

    const url = `${BASE_URL}/indexes${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-api-key": TWELVELABS_API_KEY
      }
    });
    
    if (!response.ok) {
      throw new Error(`인덱스 목록 조회 실패: ${response.status}`);
    }
    
    const result = await response.json() as any;
    console.error(`인덱스 목록 조회 완료: ${result.data?.length || 0}개 인덱스 찾음`);
    
    return {
      status: 'success',
      totalCount: result.data?.length || 0,
      indexes: result.data || [],
      pageInfo: result.page_info || {}
    };
  } catch (error) {
    console.error('인덱스 목록 조회 중 오류:', error);
    throw error;
  }
}

async function getIndex(indexId: string) {
  try {
    const url = `${BASE_URL}/indexes/${indexId}`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-api-key": TWELVELABS_API_KEY
      }
    });
    
    if (!response.ok) {
      throw new Error(`인덱스 조회 실패: ${response.status}`);
    }
    
    const result = await response.json() as any;
    console.error(`인덱스 조회 완료: id=${result._id}`);
    
    return {
      status: 'success',
      index: result
    };
  } catch (error) {
    console.error('인덱스 조회 중 오류:', error);
    throw error;
  }
}

async function updateIndex(indexId: string, indexName: string) {
  try {
    const url = `${BASE_URL}/indexes/${indexId}`;
    
    const body = {
      index_name: indexName
    };
    
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "x-api-key": TWELVELABS_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      throw new Error(`인덱스 업데이트 실패: ${response.status}`);
    }
    
    const result = await response.json() as any;
    console.error(`인덱스 업데이트 완료: id=${result._id}`);
    
    return {
      status: 'success',
      index: result
    };
  } catch (error) {
    console.error('인덱스 업데이트 중 오류:', error);
    throw error;
  }
}

async function deleteIndex(indexId: string) {
  try {
    const url = `${BASE_URL}/indexes/${indexId}`;
    
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        "x-api-key": TWELVELABS_API_KEY
      }
    });
    
    if (!response.ok) {
      throw new Error(`인덱스 삭제 실패: ${response.status}`);
    }
    
    console.error(`인덱스 삭제 완료: id=${indexId}`);
    
    return {
      status: 'success',
      message: `인덱스 ID ${indexId}가 성공적으로 삭제되었습니다`
    };
  } catch (error) {
    console.error('인덱스 삭제 중 오류:', error);
    throw error;
  }
}

async function listTasks(
  page?: number,
  pageLimit?: number,
  sortBy?: string,
  sortOption?: string,
  indexId?: string,
  status?: string[]
) {
  try {
    // 쿼리 파라미터 구성
    const queryParams = new URLSearchParams();
    if (page) queryParams.append('page', page.toString());
    if (pageLimit) queryParams.append('page_limit', pageLimit.toString());
    if (sortBy) queryParams.append('sort_by', sortBy);
    if (sortOption) queryParams.append('sort_option', sortOption);
    if (indexId) queryParams.append('index_id', indexId);
    
    // 여러 상태로 필터링
    if (status && status.length > 0) {
      status.forEach(s => queryParams.append('status', s));
    }

    const url = `${BASE_URL}/tasks${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    
    console.error(`태스크 목록 조회 요청: ${url}`);
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-api-key": TWELVELABS_API_KEY
      }
    });
    
    const responseText = await response.text();
    console.error(`API 응답 상태: ${response.status}`);
    
    if (!response.ok) {
      console.error(`태스크 목록 조회 에러: ${responseText}`);
      throw new Error(`태스크 목록 조회 실패: ${response.status}, 응답: ${responseText}`);
    }
    
    // 응답이 유효한 JSON인지 확인
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      console.error(`JSON 파싱 오류: ${e}`);
      throw new Error(`응답을 파싱할 수 없습니다: ${responseText}`);
    }
    
    console.error(`태스크 목록 조회 완료: ${result.data?.length || 0}개 태스크 찾음`);
    
    return {
      status: 'success',
      totalCount: result.data?.length || 0,
      tasks: result.data || [],
      pageInfo: result.page_info || {}
    };
  } catch (error) {
    console.error('태스크 목록 조회 중 오류:', error);
    throw error;
  }
}

async function getTask(taskId: string) {
  try {
    const url = `${BASE_URL}/tasks/${taskId}`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-api-key": TWELVELABS_API_KEY
      }
    });
    
    const responseText = await response.text();
    console.error(`태스크 조회 상태: ${response.status}`);
    
    if (!response.ok) {
      console.error(`태스크 조회 에러: ${responseText}`);
      throw new Error(`태스크 조회 실패: ${response.status}, 응답: ${responseText}`);
    }
    
    // 응답이 유효한 JSON인지 확인
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      console.error(`JSON 파싱 오류: ${e}`);
      throw new Error(`응답을 파싱할 수 없습니다: ${responseText}`);
    }
    
    console.error(`태스크 조회 완료: id=${result._id}, status=${result.status}`);
    
    // 비디오 스트리밍 정보 포함
    const hasStreaming = result.hls && result.hls.video_url;
    
    return {
      status: 'success',
      task: {
        id: result._id,
        createdAt: result.created_at,
        updatedAt: result.updated_at,
        indexId: result.index_id,
        videoId: result.video_id,
        status: result.status,
        estimatedTime: result.estimated_time,
        systemMetadata: result.system_metadata,
        streamUrl: hasStreaming ? result.hls.video_url : null,
        thumbnails: hasStreaming ? result.hls.thumbnail_urls : null
      }
    };
  } catch (error) {
    console.error('태스크 조회 중 오류:', error);
    throw error;
  }
}

async function deleteTask(taskId: string) {
  try {
    // 먼저 태스크 상태 확인
    const taskInfo = await getTask(taskId);
    const taskStatus = taskInfo.task.status;
    
    // ready 또는 failed 상태가 아니면 삭제 불가
    if (taskStatus !== 'ready' && taskStatus !== 'failed') {
      throw new Error(`태스크 삭제 실패: '${taskStatus}' 상태의 태스크는 삭제할 수 없습니다. 삭제는 'ready' 또는 'failed' 상태에서만 가능합니다.`);
    }
    
    const url = `${BASE_URL}/tasks/${taskId}`;
    
    console.error(`태스크 삭제 요청: ${taskId}`);
    
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        "x-api-key": TWELVELABS_API_KEY
      }
    });
    
    const responseText = await response.text();
    console.error(`API 응답 상태: ${response.status}`);
    
    if (!response.ok) {
      console.error(`태스크 삭제 에러: ${responseText}`);
      throw new Error(`태스크 삭제 실패: ${response.status}, 응답: ${responseText}`);
    }
    
    console.error(`태스크 삭제 완료: id=${taskId}`);
    
    return {
      status: 'success',
      taskId: taskId,
      message: `태스크 ID ${taskId}가 성공적으로 삭제되었습니다`
    };
  } catch (error) {
    console.error('태스크 삭제 중 오류:', error);
    throw error;
  }
}

// 추가 함수 - Gist 생성 (제목, 토픽, 해시태그)
async function generateGist(videoId: string, types: string[]) {
  try {
    const url = `${BASE_URL}/gist`;
    
    const body = {
      video_id: videoId,
      types: types // 'title', 'topic', 'hashtag' 중 선택
    };
    
    console.error(`Gist 생성 요청: ${JSON.stringify(body)}`);
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": TWELVELABS_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    
    const responseText = await response.text();
    console.error(`API 응답 상태: ${response.status}, 응답 본문: ${responseText}`);
    
    if (!response.ok) {
      throw new Error(`Gist 생성 실패: ${response.status}, 응답: ${responseText}`);
    }
    
    // 응답이 유효한 JSON인지 확인
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      console.error(`JSON 파싱 오류: ${e}`);
      throw new Error(`응답을 파싱할 수 없습니다: ${responseText}`);
    }
    
    console.error(`Gist 생성 완료: ${videoId}, 응답 구조: ${Object.keys(result).join(", ")}`);
    
    return {
      status: 'success',
      id: result.id || "",
      title: result.title || "",
      topics: result.topics || [],
      hashtags: result.hashtags || [],
      usage: result.usage || {},
      videoId
    };
  } catch (error) {
    console.error('Gist 생성 중 오류:', error);
    throw error;
  }
}

// 추가 함수 - 요약, 챕터, 하이라이트 생성
async function generateSummary(
  videoId: string, 
  type: string, 
  prompt?: string, 
  temperature: number = 0.2
) {
  try {
    const url = `${BASE_URL}/summarize`;
    
    const body: any = {
      video_id: videoId,
      type: type, // 'summary', 'chapter', 'highlight' 중 선택
      temperature
    };
    
    if (prompt) {
      body.prompt = prompt;
    }
    
    console.error(`요약 생성 요청: ${JSON.stringify(body)}`);
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": TWELVELABS_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    
    const responseText = await response.text();
    console.error(`API 응답 상태: ${response.status}, 응답 본문: ${responseText}`);
    
    if (!response.ok) {
      throw new Error(`요약 생성 실패: ${response.status}, 응답: ${responseText}`);
    }
    
    // 응답이 유효한 JSON인지 확인
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      console.error(`JSON 파싱 오류: ${e}`);
      throw new Error(`응답을 파싱할 수 없습니다: ${responseText}`);
    }
    
    console.error(`요약 생성 완료: ${videoId}, 응답 구조: ${Object.keys(result).join(", ")}`);
    
    return {
      status: 'success',
      id: result.id || "",
      data: result.data || {},
      usage: result.usage || {},
      type,
      videoId
    };
  } catch (error) {
    console.error('요약 생성 중 오류:', error);
    throw error;
  }
}

// 새로운 함수들 추가
async function importVideos(
  integrationId: string, 
  indexId: string, 
  incrementalImport: boolean = true, 
  retryFailed: boolean = false
) {
  try {
    const url = `${BASE_URL}/tasks/transfers/import/${integrationId}`;
    
    const body = {
      index_id: indexId,
      incremental_import: incrementalImport,
      retry_failed: retryFailed
    };
    
    console.error(`비디오 임포트 요청: ${JSON.stringify(body)}`);
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": TWELVELABS_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    
    const responseText = await response.text();
    console.error(`API 응답 상태: ${response.status}`);
    
    if (!response.ok) {
      console.error(`비디오 임포트 에러: ${responseText}`);
      throw new Error(`비디오 임포트 실패: ${response.status}, 응답: ${responseText}`);
    }
    
    // 응답이 유효한 JSON인지 확인
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      console.error(`JSON 파싱 오류: ${e}`);
      throw new Error(`응답을 파싱할 수 없습니다: ${responseText}`);
    }
    
    console.error(`비디오 임포트 성공: ${result.videos?.length || 0}개 성공, ${result.failed_files?.length || 0}개 실패`);
    
    return {
      status: 'success',
      importedVideos: result.videos || [],
      failedFiles: result.failed_files || [],
      message: `${result.videos?.length || 0}개의 비디오 임포트 작업이 시작되었습니다.`
    };
  } catch (error) {
    console.error('비디오 임포트 중 오류:', error);
    throw error;
  }
}

async function getImportStatus(integrationId: string, indexId: string) {
  try {
    const url = `${BASE_URL}/tasks/transfers/import/${integrationId}/status?index_id=${indexId}`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-api-key": TWELVELABS_API_KEY
      }
    });
    
    const responseText = await response.text();
    console.error(`API 응답 상태: ${response.status}`);
    
    if (!response.ok) {
      console.error(`임포트 상태 조회 에러: ${responseText}`);
      throw new Error(`임포트 상태 조회 실패: ${response.status}, 응답: ${responseText}`);
    }
    
    // 응답이 유효한 JSON인지 확인
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      console.error(`JSON 파싱 오류: ${e}`);
      throw new Error(`응답을 파싱할 수 없습니다: ${responseText}`);
    }
    
    console.error(`임포트 상태 조회 성공`);
    
    return {
      status: 'success',
      notImported: result.not_imported || [],
      validating: result.validating || [],
      pending: result.pending || [],
      queued: result.queued || [],
      indexing: result.indexing || [],
      ready: result.ready || [],
      failed: result.failed || []
    };
  } catch (error) {
    console.error('임포트 상태 조회 중 오류:', error);
    throw error;
  }
}

async function getImportLogs(integrationId: string) {
  try {
    const url = `${BASE_URL}/tasks/transfers/import/${integrationId}/logs`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-api-key": TWELVELABS_API_KEY
      }
    });
    
    const responseText = await response.text();
    console.error(`API 응답 상태: ${response.status}`);
    
    if (!response.ok) {
      console.error(`임포트 로그 조회 에러: ${responseText}`);
      throw new Error(`임포트 로그 조회 실패: ${response.status}, 응답: ${responseText}`);
    }
    
    // 응답이 유효한 JSON인지 확인
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      console.error(`JSON 파싱 오류: ${e}`);
      throw new Error(`응답을 파싱할 수 없습니다: ${responseText}`);
    }
    
    console.error(`임포트 로그 조회 성공: ${result.data?.length || 0}개의 로그`);
    
    return {
      status: 'success',
      logs: result.data || []
    };
  } catch (error) {
    console.error('임포트 로그 조회 중 오류:', error);
    throw error;
  }
}

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("TwelveLabs Video MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
