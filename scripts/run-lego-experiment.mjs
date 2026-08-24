import { readFile, mkdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const [sourcePath,target="bass",seedText="8401",label="",stepsText="8",guidanceText="7",shiftText="3"] = process.argv.slice(2);
if(!sourcePath)throw new Error("usage: node scripts/run-lego-experiment.mjs SOURCE.wav TARGET SEED [LABEL] [STEPS] [GUIDANCE] [SHIFT]");
const source=await readFile(resolve(sourcePath)),seed=Number(seedText),inferenceSteps=Number(stepsText),guidanceScale=Number(guidanceText),shift=Number(shiftText),caption=process.env.LEGO_CAPTION||"Warm reflective neo-soul at 74 BPM in F# minor, laid-back pocket with Rhodes, electric bass, live drums, and muted guitar",started=performance.now();
const response=await fetch(`${process.env.AI_SERVICE_BASE_URL||"http://127.0.0.1:8000"}/v1/ace-step-lego`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jobId:`lego-${target}-${seed}`,userId:"rd-user",songId:"rd-song",versionId:"rd-version",sourceAssetId:"00000000-0000-4000-8000-000000000001",targetInstrumentGroup:target,seed,caption,sourceMimeType:"audio/wav",sourceAudioBase64:source.toString("base64"),providerOptions:{model:"acestep-v15-base",inferenceSteps,guidanceScale,shift}})});
const json=await response.json();if(!response.ok)throw new Error(JSON.stringify(json));
const output=Buffer.from(json.assets[0].audio.base64,"base64"),dir=resolve("artifacts/acestep-lego");await mkdir(dir,{recursive:true});
const suffix=label?`-${label}`:"",path=resolve(dir,`${target}-seed-${seed}${suffix}.wav`);await writeFile(path,output);await writeFile(resolve(dir,`${target}-seed-${seed}${suffix}-provider.json`),JSON.stringify({source:basename(sourcePath),target,seed,caption,inferenceSteps,guidanceScale,shift,wallSeconds:(performance.now()-started)/1000,providerMetadata:json.providerMetadata,assetMetadata:json.assets[0].providerMetadata,audioMetadata:json.assets[0].metadata},null,2));
console.log(JSON.stringify({path,target,seed,inferenceSteps,guidanceScale,shift,bytes:output.byteLength,wallSeconds:Number(((performance.now()-started)/1000).toFixed(3)),providerMetadata:json.providerMetadata},null,2));
