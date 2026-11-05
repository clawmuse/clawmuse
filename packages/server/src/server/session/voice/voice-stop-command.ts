// Spoken phrases that mean "stop what you are doing". In voice mode only these cancel the
// agent's running turn; every other utterance is delivered as a steer, so a follow-up question,
// a TV in the background or a misheard noise never throws away the agent's in-progress work.
// Kept to short, whole-utterance commands: "停一下，先看看这个" is a request, not a stop.
const STOP_PHRASES = new Set([
  "停",
  "停下",
  "停止",
  "停一下",
  "停下来",
  "暂停",
  "先停",
  "先停下",
  "先停一下",
  "先停下来",
  "别做",
  "别做了",
  "别干",
  "别干了",
  "不要做",
  "不要做了",
  "不用做",
  "不用做了",
  "取消",
  "算",
  "算了",
  "stop",
  "stopit",
  "stopnow",
  "cancel",
  "nevermind",
]);

const LEADING_FILLERS = /^(?:请你|请|好的|好|嗯|啊|那|哎|你)+/u;
const TRAILING_PARTICLES = /(?:吧|了|啊|呀|哈|吗|please)+$/u;

export function isExplicitStopCommand(transcript: string): boolean {
  const compact = transcript.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
  if (!compact) return false;
  const withoutFillers = compact.replace(LEADING_FILLERS, "");
  const candidates = [compact, withoutFillers, withoutFillers.replace(TRAILING_PARTICLES, "")];
  return candidates.some((candidate) => STOP_PHRASES.has(candidate));
}
