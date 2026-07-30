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
          接下来将用大约 1 分钟介绍软件的核心功能。你可以随时跳过，并可以在帮助菜单中重新查看新手引导。
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
