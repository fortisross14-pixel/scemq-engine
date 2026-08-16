import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runtimeUrl = new URL('../components/RuntimePlayer.jsx', import.meta.url);

test('pending interactions preserve the requested action until walking completes', async () => {
  const source = await readFile(runtimeUrl, 'utf8');
  assert.match(source, /pendingActionRef\s*=\s*useRef/);
  assert.match(source, /const committed=\{\.\.\.action[\s\S]*itemId:/);
  assert.match(source, /rememberPendingAction\(committed\)/);
  assert.match(source, /void walk\.then\(\(\)=>\{if\(pendingActionRef\.current===committed\)void performPendingInteraction\(committed\)\}\)/);
  assert.match(source, /await performInteraction\(obj,action\.verb,action\.itemId/);
  assert.match(source, /interactionBusyRef\s*=\s*useRef/);
  assert.match(source, /setInteractionBusyState\(true\)/);
});


test('action animations have a safety completion clock so gameplay cannot stay locked forever', async () => {
  const source = await readFile(runtimeUrl, 'utf8');
  assert.match(source, /animationDurationMs\(resolved\.animation\)\+500/);
  assert.match(source, /Animation .* did not report completion/);
  assert.match(source, /animationResolversRef\.current\.delete\(resolverKey\)/);
});

test('runtime animation boxes use each active strip aspect while preserving scene-authored height', async () => {
  const source = await readFile(runtimeUrl, 'utf8');
  assert.match(source, /function animationRenderTransform\(baseTransform,animation\)/);
  assert.match(source, /const height=Math\.max\(1,Number\(baseTransform\?\.height\|\|1\)\)/);
  assert.match(source, /width:height\*ratio/);
  assert.match(source, /animationRenderTransform\(playerT,anim\.animation\)/);
});

test('dialogue speech is rendered in viewport space rather than inside the scrolling world', async () => {
  const source = await readFile(runtimeUrl, 'utf8');
  assert.match(source, /speechScreenAnchorFor/);
  assert.match(source, /runtime-dialogue-speech/);
});

test('dialogue is modal and scene clicks advance dialogue instead of gameplay', async () => {
  const source = await readFile(runtimeUrl, 'utf8');
  assert.match(source, /runtime-dialogue-lock/);
  assert.match(source, /if\(dialogue\)\{if\(!dialogue\.awaitingChoice\)advanceDialogueBeat\(\);return\}/);
  assert.match(source, /if\(dialogue\|\|interactionBusyRef\.current\)return/);
});

test('dialogue choices stop click propagation so selecting one cannot move the player', async () => {
  const source = await readFile(runtimeUrl, 'utf8');
  assert.match(source, /onClick=\{e=>\{e\.stopPropagation\(\);chooseDialogueChoice\(c\)\}\}/);
  assert.match(source, /dialogue\?\.awaitingChoice/);
});


test('committed interactions block extra player input until execution finishes', async () => {
  const source = await readFile(runtimeUrl, 'utf8');
  assert.match(source, /interactionBusyRef\.current/);
  assert.match(source, /finally\{[\s\S]*clearPendingAction\(\);[\s\S]*setInteractionBusyState\(false\)/);
  assert.doesNotMatch(source, /const action=pendingActionRef\.current;\s*clearPendingAction\(\);\s*if\(action\)performPendingInteraction/);
});


test('a previous speech bubble does not consume a new object interaction click', async () => {
  const source = await readFile(runtimeUrl, 'utf8');
  assert.match(source, /function clickObject[\s\S]*dismissSpeech\(\);[\s\S]*const verb=overrideVerb\|\|selectedVerb/);
  assert.doesNotMatch(source, /function clickObject[\s\S]{0,300}if\(dismissSpeech\(\)\)return/);
});


test('cutscene sequences support click-through text before and after video', async () => {
  const source = await readFile(runtimeUrl, 'utf8');
  assert.match(source, /cutscene\.beforeText/);
  assert.match(source, /cutscene\.afterText/);
  assert.match(source, /phase:\s*'video'/);
  assert.match(source, /finishCutsceneVideo/);
  assert.match(source, /advanceCutsceneText/);
  assert.match(source, /runtime-cutscene-sequence-subtitle/);
});

test('cutscene pre and post text can identify narrator or project characters', async () => {
  const editorUrl = new URL('../components/CutsceneEditor.jsx', import.meta.url);
  const source = await readFile(editorUrl, 'utf8');
  assert.match(source, /Text before cutscene/);
  assert.match(source, /Text after cutscene/);
  assert.match(source, /option value="narrator">Narrator/);
  assert.match(source, /projectCharacters/);
});


test('movement completion resolves from committed moving state so interactions cannot freeze at arrival', async () => {
  const source = await readFile(runtimeUrl, 'utf8');
  assert.match(source, /moveCompletionArmedRef/);
  assert.match(source, /moveCompletionArmedRef\.current\.has\(objectId\)&&!movingActors\[objectId\]/);
  assert.match(source, /resolve\(true\)/);
});

test('cutscene before and after text uses the same subtitle presentation over a paused video', async () => {
  const source = await readFile(runtimeUrl, 'utf8');
  assert.match(source, /autoPlay=\{activeCutscene\.phase==='video'\}/);
  assert.match(source, /activeCutscene\.phase!=='video'/);
  assert.match(source, /runtime-cutscene-subtitle runtime-cutscene-sequence-subtitle/);
  assert.doesNotMatch(source, /runtime-cutscene-text-card/);
});

test('dialogue editor follows scene logic into the actual monologue dialogue node', async () => {
  const editorUrl = new URL('../components/DialogueEditor.jsx', import.meta.url);
  const source = await readFile(editorUrl, 'utf8');
  assert.match(source, /Scene Speech \/ Monologues/);
  assert.match(source, /action\.type!=='startDialogue'/);
  assert.match(source, /dialogues\.find\(candidate=>candidate\.characterId===action\.targetId\)/);
  assert.match(source, /rule\.event\?\.type==='onEnterScene'/);
  assert.match(source, /object\.character\?\.role==='playable'/);
  assert.match(source, /kind:'dialogueNode'/);
  assert.match(source, /updateSpeechDialogueNode/);
  assert.match(source, /onChangeLogic/);
  assert.match(source, /onChangeDialogues/);
});


test('object verbs can use a direct simple text response without a Logic rule', async () => {
  const runtimeSource = await readFile(runtimeUrl, 'utf8');
  const editorUrl = new URL('../components/VisualEditor.jsx', import.meta.url);
  const editorSource = await readFile(editorUrl, 'utf8');
  assert.match(editorSource, /Simple text response \(optional\)/);
  assert.match(editorSource, /textResponse/);
  assert.match(runtimeSource, /const quickText=String\(binding\?\.textResponse\|\|''\)\.trim\(\)/);
  assert.match(runtimeSource, /stringKey\.objectResponse\(sceneRef\.id,obj\.id,verb\)/);
  assert.match(runtimeSource, /sayLine\(localized,playerDefinition\?\.id\|\|''/);
});

test('runtime close-ups are screen-space modal controls bound directly to variables', async () => {
  const source=await readFile(runtimeUrl,'utf8');
  const editorSource=await readFile(new URL('../components/CloseUpEditor.jsx', import.meta.url),'utf8');
  assert.match(source,/runtime-closeup-layer/);
  assert.match(source,/runtime-closeup-panel/);
  assert.match(source,/stepCloseUpNumber/);
  assert.match(source,/cycleCloseUpToggle/);
  assert.match(source,/writeVariableValue\(element\.variableId/);
  assert.match(source,/if\(playerId\)completeActorMove\(playerId\)/);
  assert.match(editorSource,/Numeric|numberStepper/i);
  assert.match(editorSource,/Bound variable/);
  assert.match(editorSource,/Wrap at min\/max/);
});

test('hotspots can open close-ups directly and Logic can explicitly play a cutscene', async () => {
  const runtimeSource=await readFile(runtimeUrl,'utf8');
  const visualSource=await readFile(new URL('../components/VisualEditor.jsx', import.meta.url),'utf8');
  const logicSource=await readFile(new URL('../components/LogicEditor.jsx', import.meta.url),'utf8');
  assert.match(visualSource,/Open Close-Up \(optional\)/);
  assert.match(runtimeSource,/binding\?\.openCloseUpId/);
  assert.match(runtimeSource,/case 'openCloseUp'/);
  assert.match(runtimeSource,/case 'playCutscene'/);
  assert.match(logicSource,/playCutscene:'Play a named scene cutscene immediately/);
});
