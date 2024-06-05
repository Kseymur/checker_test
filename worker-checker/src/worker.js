import { fetchDiffText, extractAdditionsFromDiff, postGitHubComment } from "./githubUtils.js";
import { callOpenAI } from "./llmUtils.js";
import { webSearch, formatResultsFull } from "./search.js";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event));
});

async function handleRequest(event) {
  const request = event.request;
  console.log('Request received at main worker');

  if (request.method !== "POST") {
    console.log('Method not allowed');
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload = await request.json();
    console.log(`Received payload: ${JSON.stringify(payload)}`);

    const commentBody = payload.comment.body;
    console.log(`Comment body: ${commentBody}`);

    if (payload.action === 'created' && commentBody.includes("/articlecheck")) {
      const prDetails = payload.issue.pull_request;

      console.log('Fetching diff text...');
      const diff = await fetchDiffText(prDetails, TOKEN_GITHUB);
      const diffText = extractAdditionsFromDiff(diff);
      console.log(`Clean diff: ${diffText}`);

      console.log('Calling OpenAI for extracting statements...');
      const extractingPrompt = await checkerPrompts.get("EXTRACTING_PROMPT");
      const statements = await callOpenAI(extractingPrompt, `<text>${diffText}</text>`, OPENAI_API_KEY, LLM_ENDPOINT);
      console.log(`Extracted statements: ${JSON.stringify(statements)}`);

      console.log('Calling OpenAI for retrieving answers...');
      const retrievingPrompt = await checkerPrompts.get("RETRIEVAL_PROMPT");
      let retrieveAnswer = await callOpenAI(retrievingPrompt, statements, OPENAI_API_KEY, LLM_ENDPOINT, LLM_MODEL);
      console.log(`Retrieve answer: ${retrieveAnswer}`);

      retrieveAnswer = JSON.parse(retrieveAnswer);

      let completions = "";

      for (let params of retrieveAnswer) {
        console.log('Performing web search...');
        const searchResults = await webSearch(params, BRAVE_API_KEY, SEARCH_ENDPOINT);
        const results = searchResults.web.results;
        const formattedSearchResults = formatResultsFull(results);
        console.log(`Formatted search results: ${formattedSearchResults}`);
        completions += formattedSearchResults;
        await sleep(1000);
      }

      console.log(`Completions: ${completions}`);

      console.log('Calling OpenAI for final answer...');
      const answerPrompt = await checkerPrompts.get("ANSWER_PROMPT");
      const finalAnswer = await callOpenAI(
        answerPrompt,
        `<statements>${JSON.stringify(statements)}</statements><fact_checking_results>${completions}</fact_checking_results><text>${diffText}</text>`,
        OPENAI_API_KEY,
        LLM_ENDPOINT,
        LLM_MODEL
      );
      console.log("Final answer received:", finalAnswer);

      console.log('Posting GitHub comment...');
      await postGitHubComment(prDetails.url, finalAnswer, TOKEN_GITHUB);
    } else {
      console.log("No valid action or command in comment");
    }

    return new Response("Request processed", { status: 200 });
  } catch (error) {
    console.error("Error processing request:", error);
    return new Response("Internal server error", { status: 500 });
  }
}