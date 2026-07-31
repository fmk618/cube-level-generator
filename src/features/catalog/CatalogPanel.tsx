import { useEffect, useMemo, useRef, useState } from 'react';
import { useCatalogStore, type LevelMoveDirection } from '@/shared/store/useCatalogStore';
import { useUiStore } from '@/shared/store/useUiStore';
import {
  buildLevelManagerViewModel,
  getLevelGuidanceSummary,
  resolveLevelGuidanceFailureThreshold,
  type LevelManagerFilter,
  type LevelManagerItem,
  type LevelManagerSection,
} from '@/core/levels';

type ChapterDraft = {
  id: string | null;
  partName: string;
  title: string;
  description: string;
  capacity: string;
};

const FILTERS: { key: LevelManagerFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'hidden', label: '隐藏' },
];

function AddButtonLabel({ children }: { children: string }) {
  return (
    <>
      <svg className="btn-leading-icon" viewBox="0 0 20 20" fill="none" aria-hidden>
        <path d="M10 4v12M4 10h12" />
      </svg>
      <span>{children}</span>
    </>
  );
}

type ActionIconName = 'copy' | 'show' | 'hide' | 'up' | 'down' | 'edit' | 'delete';

type ActionMenuItemDefinition = {
  label: string;
  icon: ActionIconName;
  disabled?: boolean;
  danger?: boolean;
  onSelect: () => void;
};

function ActionIcon({ name }: { name: ActionIconName }) {
  const paths: Record<ActionIconName, React.ReactNode> = {
    copy: <><rect x="8" y="8" width="10" height="10" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
    show: <><path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5Z" /><circle cx="12" cy="12" r="2.5" /></>,
    hide: <><path d="m3 3 18 18" /><path d="M10.6 7.2A10 10 0 0 1 12 7c6 0 9.5 5 9.5 5a15 15 0 0 1-2.2 2.5M6.5 6.6A15 15 0 0 0 2.5 12s3.5 5 9.5 5a10 10 0 0 0 3-.4" /></>,
    up: <><path d="m6 11 6-6 6 6" /><path d="M12 5v14" /></>,
    down: <><path d="m6 13 6 6 6-6" /><path d="M12 5v14" /></>,
    edit: <><path d="M4 20h4l11-11-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>,
    delete: <><path d="M4 7h16" /><path d="m9 7 .5-3h5l.5 3M7 7l1 13h8l1-13" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden>{paths[name]}</svg>;
}

function ActionMenu({
  label,
  className,
  items,
}: {
  label: string;
  className: string;
  items: ActionMenuItemDefinition[];
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={menuRef} className={`actions-menu ${className} ${open ? 'is-open' : ''}`} onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="icon-btn actions-menu-trigger"
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="19" cy="12" r="1.7" />
        </svg>
      </button>
      <div className="actions-menu-popover" role="menu" aria-hidden={!open}>
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className={`action-menu-item ${item.danger ? 'action-menu-danger' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              setOpen(false);
              item.onSelect();
            }}
          >
            <ActionIcon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function CatalogPanel() {
  const {
    levels, chapters, isLoaded, isLoading, loadError, hasUnsavedChanges, runtimeFilePath,
    refreshCatalog, discardChanges, resetToDefault, importFromDisk, exportToDisk,
    createChapter, updateChapter, moveChapter, deleteChapter,
    createLevelForChapter, duplicateLevel, moveLevel, deleteLevel, updateLevel,
  } = useCatalogStore();
  const selectedLevelId = useUiStore((s) => s.selectedLevelId);
  const selectLevel = useUiStore((s) => s.selectLevel);
  const aiTouchedLevelIds = useUiStore((s) => s.aiTouchedLevelIds);

  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<LevelManagerFilter>('all');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [chapterDraft, setChapterDraft] = useState<ChapterDraft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    void refreshCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const viewModel = useMemo(
    () => buildLevelManagerViewModel(levels, [], { searchTerm, filter, chapters }),
    [levels, chapters, searchTerm, filter],
  );

  useEffect(() => {
    setExpanded((prev) => {
      const next: Record<string, boolean> = {};
      const forceAll = Boolean(searchTerm.trim()) || filter !== 'all';
      viewModel.sections.forEach((section, index) => {
        next[section.chapterId] = forceAll ? true : (prev[section.chapterId] ?? index === 0);
      });
      return next;
    });
  }, [viewModel.sections, searchTerm, filter]);

  const guidanceByLevelId = useMemo(() => {
    const map: Record<string, ReturnType<typeof getLevelGuidanceSummary>> = {};
    for (const level of levels) {
      map[level.id] = getLevelGuidanceSummary(level);
    }
    return map;
  }, [levels]);

  const run = async (key: string, action: () => unknown) => {
    setBusy(key);
    setBanner(null);
    try {
      await action();
    } catch (error) {
      setBanner(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const handleAppend = (chapterId: string) => run(`append:${chapterId}`, () => {
    const level = createLevelForChapter(chapterId);
    selectLevel(level.id);
  });

  const handleMoveLevel = (levelId: string, direction: LevelMoveDirection) =>
    run(`move:${levelId}:${direction}`, () => moveLevel(levelId, direction));

  const handleToggleHidden = (levelId: string, nextHidden: boolean) =>
    run(`hidden:${levelId}`, () => updateLevel(levelId, { hidden: nextHidden || undefined }));

  const handleDelete = (item: LevelManagerItem) => {
    if (!item.level) return;
    if (!window.confirm(`确定要删除「${item.level.title}」吗？此操作会立即从草稿中移除该关卡。`)) return;
    void run(`delete:${item.level.id}`, () => {
      deleteLevel(item.level!.id);
      if (selectedLevelId === item.level!.id) selectLevel(null);
    });
  };

  const handleSubmitChapter = () => {
    if (!chapterDraft) return;
    const capacity = Number(chapterDraft.capacity);
    void run('chapter-submit', () => {
      if (chapterDraft.id) {
        updateChapter(chapterDraft.id, {
          partName: chapterDraft.partName,
          title: chapterDraft.title,
          description: chapterDraft.description,
          capacity,
        });
      } else {
        createChapter({
          partName: chapterDraft.partName,
          title: chapterDraft.title,
          description: chapterDraft.description,
          capacity,
        });
      }
      setChapterDraft(null);
    });
  };

  if (!isLoaded && isLoading) {
    return (
      <div className="panel panel--sidebar catalog-panel">
        <div className="panel-scroll panel-loading">加载关卡目录中…</div>
      </div>
    );
  }

  return (
    <div className="panel panel--sidebar catalog-panel">
      <div className="panel-scroll">
        <div className="panel-top">
          <div className="panel-top-row">
            <div className="panel-heading">
              <h2>关卡管理</h2>
              <p>浏览与组织教学关卡</p>
            </div>
            <span className="count-badge">{viewModel.summary.configuredCount}</span>
          </div>
          <div className="stat-line">
            <span><strong>{viewModel.summary.hiddenCount}</strong> 个隐藏</span>
            {hasUnsavedChanges && <span className="save-state save-state-small"><i />未保存</span>}
          </div>
        </div>

        {loadError && <div className="banner banner-error">{loadError}</div>}
        {banner && <div className="banner banner-error">{banner}</div>}

        <div className="panel-section" data-tour="level-search">
          <div className="search-field">
            <svg className="search-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4 4" />
            </svg>
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜索关卡、ID 或章节"
              className="text-input"
              aria-label="搜索关卡"
            />
            {searchTerm && (
              <button type="button" className="search-clear" onClick={() => setSearchTerm('')} aria-label="清除搜索">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden><path d="m7 7 10 10M17 7 7 17" /></svg>
              </button>
            )}
          </div>
          <div className="segmented filter-chips">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                className={`chip ${filter === f.key ? 'chip-active' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="chapter-list" data-tour="level-list">
          {viewModel.sections.map((section, index) => (
            <ChapterSection
              key={section.chapterId}
              section={section}
              tone={index % 6}
              expanded={expanded[section.chapterId] ?? false}
              onToggle={() => setExpanded((prev) => ({ ...prev, [section.chapterId]: !prev[section.chapterId] }))}
              onEditChapter={() => {
                const chapter = chapters.find((c) => c.id === section.chapterId);
                setChapterDraft({
                  id: section.chapterId,
                  partName: section.partName,
                  title: section.chapterLabel,
                  description: chapter?.description ?? '',
                  capacity: String(section.capacity),
                });
              }}
              onMoveChapter={(direction) => run(`chapter-move:${section.chapterId}`, () => moveChapter(section.chapterId, direction))}
              onDeleteChapter={() => {
                if (!window.confirm(`确定要删除章节「${section.chapterLabel}」吗？`)) return;
                void run(`chapter-delete:${section.chapterId}`, () => deleteChapter(section.chapterId));
              }}
              onAppend={() => handleAppend(section.chapterId)}
              selectedLevelId={selectedLevelId}
              aiTouchedLevelIds={aiTouchedLevelIds}
              busy={busy}
              guidanceByLevelId={guidanceByLevelId}
              onSelect={(id) => selectLevel(id)}
              onDuplicate={(id) => run(`duplicate:${id}`, () => { const l = duplicateLevel(id); selectLevel(l.id); })}
              onToggleHidden={handleToggleHidden}
              onMove={handleMoveLevel}
              onDelete={handleDelete}
            />
          ))}
          <button
            className="btn btn-ghost btn-block catalog-add-button"
            disabled={busy !== null}
            onClick={() => setChapterDraft({ id: null, partName: `Part${chapters.length + 1}`, title: '', description: '', capacity: '6' })}
          >
            <AddButtonLabel>新增章节</AddButtonLabel>
          </button>
        </div>
      </div>

      <div className="panel-footer" data-tour="import-export">
        <div className="file-summary">
          <div>
            <p className="section-title">关卡文件</p>
            <p className="file-path" title={runtimeFilePath ?? ''}>{runtimeFilePath}</p>
          </div>
        </div>
        <div className="btn-grid">
          <button className="btn btn-sm" disabled={busy !== null} onClick={() => run('import', () => importFromDisk())}>导入配置</button>
          <button className="btn btn-sm" disabled={busy !== null} onClick={() => run('export', () => exportToDisk())}>导出配置</button>
          <button className="btn btn-sm" disabled={busy !== null || !hasUnsavedChanges} onClick={() => run('discard', () => discardChanges())}>放弃草稿</button>
          <button className="btn btn-sm btn-danger" disabled={busy !== null} onClick={() => {
            if (!window.confirm('确定要恢复默认关卡吗？这会覆盖当前草稿。')) return;
            void run('reset', () => resetToDefault());
          }}>恢复默认</button>
        </div>
      </div>

      {chapterDraft && (
        <div className="modal-backdrop" onClick={() => setChapterDraft(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>{chapterDraft.id ? '编辑章节' : '新增章节'}</h3>
            <label>章节短名称
              <input className="text-input" value={chapterDraft.partName} onChange={(e) => setChapterDraft({ ...chapterDraft, partName: e.target.value })} />
            </label>
            <label>章节标题
              <input className="text-input" value={chapterDraft.title} onChange={(e) => setChapterDraft({ ...chapterDraft, title: e.target.value })} />
            </label>
            <label>章节说明
              <textarea className="text-input" value={chapterDraft.description} onChange={(e) => setChapterDraft({ ...chapterDraft, description: e.target.value })} />
            </label>
            <label>地图槽位容量
              <input className="text-input" value={chapterDraft.capacity} onChange={(e) => setChapterDraft({ ...chapterDraft, capacity: e.target.value.replace(/[^0-9]/g, '') })} />
            </label>
            <div className="modal-actions">
              <button className="btn" onClick={() => setChapterDraft(null)}>取消</button>
              <button className="btn btn-primary" disabled={busy !== null} onClick={handleSubmitChapter}>
                {chapterDraft.id ? '保存章节' : '创建章节'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type ChapterSectionProps = {
  section: LevelManagerSection;
  tone: number;
  expanded: boolean;
  onToggle: () => void;
  onEditChapter: () => void;
  onMoveChapter: (direction: LevelMoveDirection) => void;
  onDeleteChapter: () => void;
  onAppend: () => void;
  selectedLevelId: string | null;
  aiTouchedLevelIds: string[];
  busy: string | null;
  guidanceByLevelId: Record<string, ReturnType<typeof getLevelGuidanceSummary>>;
  onSelect: (levelId: string) => void;
  onDuplicate: (levelId: string) => void;
  onToggleHidden: (levelId: string, nextHidden: boolean) => void;
  onMove: (levelId: string, direction: LevelMoveDirection) => void;
  onDelete: (item: LevelManagerItem) => void;
};

function ChapterSection({
  section, tone, expanded, onToggle, onEditChapter, onMoveChapter, onDeleteChapter, onAppend,
  selectedLevelId, aiTouchedLevelIds, busy, guidanceByLevelId,
  onSelect, onDuplicate, onToggleHidden, onMove, onDelete,
}: ChapterSectionProps) {
  return (
    <div className={`chapter-section chapter-tone-${tone}`}>
      <div className="chapter-header">
        <button className="chapter-header-toggle" onClick={onToggle}>
          <span className={`chevron ${expanded ? 'chevron-down' : ''}`} aria-hidden>
            <svg viewBox="0 0 24 24" fill="none">
              <path d="m9 5 7 7-7 7" />
            </svg>
          </span>
          <div className="chapter-copy">
            <div className="chapter-eyebrow">{section.partName}</div>
            <div className="chapter-title" title={section.chapterLabel}>{section.chapterLabel}</div>
            <div className="chapter-subtitle">
              {section.configuredCount} 个关卡 · 容量 {section.capacity} · {section.hiddenCount} 个隐藏
            </div>
          </div>
        </button>
        <div className="chapter-header-actions">
          <button
            type="button"
            className="icon-btn"
            title="上移章节"
            aria-label="上移章节"
            disabled={!section.canMoveUp || busy !== null}
            onClick={() => onMoveChapter('up')}
          >
            <ActionIcon name="up" />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="下移章节"
            aria-label="下移章节"
            disabled={!section.canMoveDown || busy !== null}
            onClick={() => onMoveChapter('down')}
          >
            <ActionIcon name="down" />
          </button>
          <ActionMenu
            label="章节操作"
            className="chapter-actions-menu"
            items={[
              { label: '编辑章节', icon: 'edit', onSelect: onEditChapter },
              { label: '删除章节', icon: 'delete', danger: true, disabled: section.configuredCount > 0, onSelect: onDeleteChapter },
            ]}
          />
        </div>
      </div>

      {expanded && (
        <div className="chapter-body">
          {section.items.length === 0 && <div className="empty-hint">当前章节还没有关卡</div>}
          {section.items.map((item) => (
            <LevelRow
              key={item.key}
              item={item}
              selected={selectedLevelId === item.level?.id}
              aiTouched={Boolean(item.level && aiTouchedLevelIds.includes(item.level.id))}
              busy={busy}
              guidance={item.level ? guidanceByLevelId[item.level.id] : undefined}
              onSelect={onSelect}
              onDuplicate={onDuplicate}
              onToggleHidden={onToggleHidden}
              onMove={onMove}
              onDelete={onDelete}
            />
          ))}
          <button className="btn btn-ghost btn-block catalog-add-button" onClick={onAppend}>
            <AddButtonLabel>新增关卡</AddButtonLabel>
          </button>
        </div>
      )}
    </div>
  );
}

type LevelRowProps = {
  item: LevelManagerItem;
  selected: boolean;
  aiTouched: boolean;
  busy: string | null;
  guidance: ReturnType<typeof getLevelGuidanceSummary> | undefined;
  onSelect: (levelId: string) => void;
  onDuplicate: (levelId: string) => void;
  onToggleHidden: (levelId: string, nextHidden: boolean) => void;
  onMove: (levelId: string, direction: LevelMoveDirection) => void;
  onDelete: (item: LevelManagerItem) => void;
};

function LevelRow({ item, selected, aiTouched, busy, guidance, onSelect, onDuplicate, onToggleHidden, onMove, onDelete }: LevelRowProps) {
  if (!item.level) return null;
  const level = item.level;
  const failureThreshold = resolveLevelGuidanceFailureThreshold(level.guidanceFailureThreshold);
  const disabled = busy !== null;

  return (
    <div
      className={`level-row ${selected ? 'level-row-selected' : ''} ${aiTouched ? 'level-row-ai-touched' : ''}`}
      onClick={() => onSelect(level.id)}
    >
      <div className="level-row-content">
        <div className="level-row-top">
          <span className="level-title" title={`${item.orderLabel} ${level.title}`}>
            <span className="level-order">{item.orderLabel}</span>
            {level.title}
          </span>
          {aiTouched && <span className="ai-touched-badge">AI</span>}
        </div>
        <div className="level-row-meta">
          {item.isHidden && <span className="level-meta-warning">隐藏 · </span>}
          <span>{guidance?.status === 'ready' ? `${guidance.stepCount} 步` : guidance?.status === 'invalid' ? '解法无效' : '缺少解法'}</span>
          <span>·</span>
          <span>失败 {failureThreshold} 次解锁</span>
        </div>
      </div>
      <div className="level-row-actions" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="icon-btn"
          title="上移关卡"
          aria-label="上移关卡"
          disabled={disabled || !item.canMoveUp}
          onClick={() => onMove(level.id, 'up')}
        >
          <ActionIcon name="up" />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="下移关卡"
          aria-label="下移关卡"
          disabled={disabled || !item.canMoveDown}
          onClick={() => onMove(level.id, 'down')}
        >
          <ActionIcon name="down" />
        </button>
        <ActionMenu
          label="关卡操作"
          className="level-actions-menu"
          items={[
            { label: '复制关卡', icon: 'copy', disabled, onSelect: () => onDuplicate(level.id) },
            { label: item.isHidden ? '显示关卡' : '隐藏关卡', icon: item.isHidden ? 'show' : 'hide', disabled, onSelect: () => onToggleHidden(level.id, !item.isHidden) },
            { label: '删除关卡', icon: 'delete', danger: true, disabled, onSelect: () => onDelete(item) },
          ]}
        />
      </div>
    </div>
  );
}
