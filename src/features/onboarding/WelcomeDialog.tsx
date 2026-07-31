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
        <h2 id="ob-welcome-title">欢迎使用关卡内容生产工具</h2>
        <p>
          本工具用三个页面完成数据联调，并在导出前做发布检查。接下来会按调试顺序带你走一遍。
        </p>
        <ol className="ob-welcome-flow">
          <li>
            <strong>关卡内容</strong>
            <span>配置真实可玩的公式、矩阵与状态</span>
          </li>
          <li>
            <strong>AI 能力标签</strong>
            <span>定义系统判断玩家能力的内部维度（不含公式）</span>
          </li>
          <li>
            <strong>AI 推荐配置</strong>
            <span>给每关指定一个主能力标签和推荐参数</span>
          </li>
          <li>
            <strong>发布检查</strong>
            <span>确认候选 Level 能被 App 正确执行并导出 v1 契约</span>
          </li>
        </ol>
        <p className="ob-welcome-tip">
          一关只绑一个主 Skill；一个 Skill 可关联多关。可随时跳过，也可从「帮助 → 新手引导」重看。
        </p>
        <div className="ob-welcome-actions">
          <button type="button" className="ob-welcome-btn" onClick={onSkip}>
            跳过
          </button>
          <button type="button" className="ob-welcome-btn ob-welcome-btn-primary" onClick={onStart}>
            开始引导
          </button>
        </div>
      </div>
    </div>
  );
}
