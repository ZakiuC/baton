export type LampTone = 'idle' | 'run' | 'accent' | 'warn' | 'danger' | 'done' | 'blocked';

/** 状态灯：机台方向里唯一允许发光的元素。纯装饰，文字标签另行提供。 */
export default function Lamp({ tone = 'idle' }: { tone?: LampTone }) {
  return <span className={`lamp lamp--${tone}`} aria-hidden="true" />;
}
