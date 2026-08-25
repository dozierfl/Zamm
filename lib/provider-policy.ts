import type { CreateGeneration } from "./domain";

const imitationPattern=/\b(?:in the style of|sounds? like|voice of|sing(?:ing)? like|imitate|mimic)\b/i;

export function validateElevenLabsPolicy(input:Pick<CreateGeneration,"prompt"|"lyrics"|"providerPolicyAccepted">){
  if(!input.providerPolicyAccepted)throw new Error("PROVIDER_POLICY_ACCEPTANCE_REQUIRED");
  if(imitationPattern.test(`${input.prompt}\n${input.lyrics||""}`))throw new Error("PROVIDER_PROMPT_REJECTED");
}
