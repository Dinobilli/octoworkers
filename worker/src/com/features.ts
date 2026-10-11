import type { AppBindings } from './bindings'
export function features(env: AppBindings) {
  return { kakao: env.ENABLE_KAKAO === 'true', groble: env.ENABLE_GROBLE === 'true',
    ai: env.ENABLE_AI !== 'false', agents: env.ENABLE_AGENTS !== 'false',
    vector: env.ENABLE_VECTOR !== 'false', examples: env.ENABLE_EXAMPLES !== 'false' }
}
