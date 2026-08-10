import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const candidates = JSON.parse(fs.readFileSync(path.join(root, 'data/registry-candidates.json'), 'utf8'));
const media = [
 ['techcrunch-ai','TechCrunch AI','https://techcrunch.com/category/artificial-intelligence/'],['the-verge-ai','The Verge AI','https://www.theverge.com/ai-artificial-intelligence'],['wired-ai','WIRED AI','https://www.wired.com/tag/artificial-intelligence/'],['mit-technology-review-ai','MIT Technology Review AI','https://www.technologyreview.com/topic/artificial-intelligence/'],['ars-technica-ai','Ars Technica AI','https://arstechnica.com/ai/'],['venturebeat-ai','VentureBeat AI','https://venturebeat.com/category/ai/'],['the-information-ai','The Information AI','https://www.theinformation.com/artificial-intelligence'],['semafor-ai','Semafor AI','https://www.semafor.com/topic/artificial-intelligence'],['financial-times-ai','Financial Times AI','https://www.ft.com/artificial-intelligence'],['reuters-ai','Reuters AI','https://www.reuters.com/technology/artificial-intelligence/'],['bloomberg-ai','Bloomberg AI','https://www.bloomberg.com/ai'],['axios-ai','Axios AI+','https://www.axios.com/technology/artificial-intelligence'],['404-media','404 Media','https://www.404media.co/tag/artificial-intelligence/'],['platformer','Platformer','https://www.platformer.news/'],['import-ai','Import AI','https://importai.substack.com/'],['chinai','ChinAI Newsletter','https://chinai.substack.com/']
];
const repos = `
openai/openai-python openai/openai-node openai/evals openai/tiktoken openai/whisper openai/gym
anthropics/anthropic-sdk-python anthropics/anthropic-sdk-typescript anthropics/courses anthropics/prompt-eng-interactive-tutorial
huggingface/transformers huggingface/diffusers huggingface/peft huggingface/accelerate huggingface/trl huggingface/text-generation-inference huggingface/safetensors huggingface/tokenizers huggingface/datasets huggingface/hub-docs
pytorch/pytorch tensorflow/tensorflow jax-ml/jax keras-team/keras
vllm-project/vllm ggml-org/llama.cpp ggerganov/whisper.cpp ml-explore/mlx ml-explore/mlx-lm
microsoft/DeepSpeed microsoft/semantic-kernel microsoft/autogen microsoft/AI-For-Beginners microsoft/graphrag microsoft/generative-ai-for-beginners
NVIDIA/Megatron-LM NVIDIA/TensorRT-LLM NVIDIA/NeMo NVIDIA/NeMo-Guardrails NVIDIA/cutlass
ray-project/ray modal-labs/modal-client replicate/replicate-python
langchain-ai/langchain langchain-ai/langgraph run-llama/llama_index crewAIInc/crewAI microsoft/TaskWeaver
microsoft/markitdown All-Hands-AI/OpenHands browser-use/browser-use modelcontextprotocol/servers
BerriAI/litellm open-webui/open-webui lobehub/lobe-chat ChatGPTNextWeb/NextChat
ollama/ollama lm-sys/FastChat lm-sys/RouteLLM huggingface/chat-ui
stanfordnlp/dspy Guidance-ai/guidance outlines-dev/outlines instructor-ai/instructor
qdrant/qdrant milvus-io/milvus weaviate/weaviate chroma-core/chroma pgvector/pgvector
facebookresearch/faiss facebookresearch/segment-anything facebookresearch/dinov2 facebookresearch/llama-recipes
facebookresearch/audiocraft facebookresearch/ImageBind facebookresearch/detectron2
google-deepmind/gemma google-deepmind/alphafold google-deepmind/mujoco google-deepmind/open_spiel google-deepmind/graphcast
google-gemini/generative-ai-python google-gemini/cookbook google/adk-python google/adk-js
QwenLM/Qwen2.5 QwenLM/Qwen-Agent QwenLM/Qwen2.5-Coder QwenLM/Qwen-VL
mistralai/mistral-inference mistralai/mistral-common mistralai/cookbook
deepseek-ai/DeepSeek-V3 deepseek-ai/DeepSeek-R1 deepseek-ai/Janus deepseek-ai/DeepSeek-Coder-V2
THUDM/ChatGLM3 THUDM/GLM-4 THUDM/CogVideo
01-ai/Yi MiniMax-AI/MiniMax-01 moonshotai/Kimi-Audio
Stability-AI/generative-models Stability-AI/sd3.5 Stability-AI/stable-audio-tools
black-forest-labs/flux comfyorg/comfyui AUTOMATIC1111/stable-diffusion-webui invoke-ai/InvokeAI
ultralytics/ultralytics open-mmlab/mmdetection open-mmlab/mmengine
Lightning-AI/pytorch-lightning Lightning-AI/litgpt karpathy/nanoGPT karpathy/llm.c
EleutherAI/gpt-neox EleutherAI/lm-evaluation-harness EleutherAI/pythia
allenai/OLMo allenai/open-instruct allenai/ARC-Solvers
LAION-AI/Open-Assistant LAION-AI/aesthetic-predictor
OpenBMB/MiniCPM-V OpenBMB/ChatDev InternLM/InternLM-XComposer
PaddlePaddle/PaddleNLP PaddlePaddle/PaddleOCR
PKU-Alignment/safe-rlhf huggingface/lerobot
mozilla-ai/llamafile bentoml/BentoML dagster-io/dagster
wandb/wandb wandb/examples
explosion/spaCy scikit-learn/scikit-learn apache/arrow
` .trim().split(/\s+/);

const now = new Date().toISOString();
const common = (id, kind, name, url, category, platform) => ({id:`src_${id}`,kind,name,url,category,platform,languages:['en'],topics:['digital_agi'],priority: kind==='organization'?0.75:kind==='person'?0.62:kind==='media'?0.68:0.65,active:true,reviewedAt:now});
const sources = [
 ...candidates.organizations.map(x=>common(x.slug,'organization',x.name,x.url,x.category,'web')),
 ...media.map(([id,name,url])=>common(id,'media',name,url,'ai-news','web')),
 common('arxiv-cs-ai','other','arXiv cs.AI','https://export.arxiv.org/rss/cs.AI','academic-paper-feed','rss'),
 common('github-community','other','GitHub AI Community','https://github.com/topics/artificial-intelligence','community-project-index','github'),
 ...candidates.people.map(x=>common(x.slug,'person',x.name,x.url,x.role,'web')),
 ...repos.map(repo=>common(repo.toLowerCase().replaceAll('/','-').replaceAll('.','-'),'project',repo.split('/').at(-1),`https://github.com/${repo}`,'github-project','github'))
];
const covariant = sources.find((source) => source.id === 'src_covariant');
if (covariant) {
 covariant.active = false;
 covariant.disabledReason = 'No surviving official content archive was found during the 2026-08-10 registry audit; retain the entity without crawling its homepage.';
}
const counts = sources.reduce((a,s)=>(a[s.kind]=(a[s.kind]||0)+1,a),{});
const payload={schemaVersion:'1.0.0',generatedAt:now,counts,sources};
fs.mkdirSync(path.join(root,'content'),{recursive:true});
fs.writeFileSync(path.join(root,'content/registry.json'),JSON.stringify(payload,null,2)+'\n');
console.log(counts);
