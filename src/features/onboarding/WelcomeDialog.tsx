import './onboarding.css';

type WelcomeDialogProps = {
  onStart: () => void;
  onSkip: () => void;
};

export function WelcomeDialog({ onStart, onSkip }: WelcomeDialogProps) {
  return (
    <div className="ob-welcome-overlay" role="presentation">
      <div
        className="ob-welcome-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ob-welcome-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="ob-welcome-title">欢迎使用关卡编辑器</h2>
        <p>
          本工具用三个页面完成关卡数据联调。接下来会按调试顺序带你走一遍，大约 2 分钟。
        </p>
        <ol className="ob-welcome-flow">
          <li>
            <strong>关卡编辑</strong>
            <span>维护关卡内容：章节、状态、公式与预览</span>
          </li>
          <li>
            <strong>技能编辑</strong>
            <span>维护 CFOP 技能树：阶段、目标与掌握标准</span>
          </li>
          <li>
            <strong>关卡映射</strong>
            <span>把关卡挂到技能上，并设置教学模式 / 难度</span>
          </li>
        </ol>
        <p className="ob-welcome-tip">
          推荐顺序：先有关卡与技能，再做映射校验与导出。可随时跳过，也可从「帮助 → 新手引导」重看。
        </p>
        <div className="ob-welcome-actions">
          <button type="button" className="ob-welcome-btn" onClick={onSkip}>
            跳过引导
          </button>
          <button type="button" className="ob-welcome-btn ob-welcome-btn-primary" onClick={onStart}>
            开始引导
          </button>
        </div>
      </div>
    </div>
  );
}
