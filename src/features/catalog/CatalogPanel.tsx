import { useEffect, useMemo, useState } from 'react';
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

export function CatalogPanel() {
  const {
    levels, chapters, isLoaded, isLoading, loadError, hasUnsavedChanges, runtimeFilePath,
    refreshCatalog, saveCatalog, discardChanges, resetToDefault, importFromDisk, exportToDisk,
    createChapter, updateChapter, moveChapter, deleteChapter,
    createLevelForChapter, duplicateLevel, moveLevel, deleteLevel, updateLevel,
  } = useCatalogStore();
  const selectedLevelId = useUiStore((s) => s.selectedLevelId);
  const selectLevel = useUiStore((s) => s.selectLevel);

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
    return <div className="panel catalog-panel"><div className="panel-loading">加载关卡目录中…</div></div>;
  }

  return (
    <div className="panel catalog-panel">
      <div className="panel-header">
        <h2>关卡管理</h2>
        <div className="summary-row">
          <span>{viewModel.summary.configuredCount} 个关卡</span>
          <span>{viewModel.summary.hiddenCount} 个隐藏</span>
          {hasUnsavedChanges && <span className="badge badge-warn">未保存</span>}
        </div>
      </div>

      {loadError && <div className="banner banner-error">{loadError}</div>}
      {banner && <div className="banner banner-error">{banner}</div>}

      <div className="search-row">
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="搜索关卡标题 / ID / 章节"
          className="text-input"
        />
        <div className="filter-chips">
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

      <div className="chapter-list">
        {viewModel.sections.map((section) => (
          <ChapterSection
            key={section.chapterId}
            section={section}
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
          className="btn btn-ghost btn-block"
          disabled={busy !== null}
          onClick={() => setChapterDraft({ id: null, partName: `Part${chapters.length + 1}`, title: '', description: '', capacity: '6' })}
        >
          + 新增章节
        </button>
      </div>

      <div className="danger-zone">
        <h3>关卡文件</h3>
        <p className="danger-zone-hint">
          导入 / 恢复默认会立即覆盖草稿；保存到文件才会写入运行文件；导出用于分享给 App 仓库。
        </p>
        <p className="file-path" title={runtimeFilePath ?? ''}>{runtimeFilePath}</p>
        <div className="danger-actions">
          <button className="btn" disabled={busy !== null} onClick={() => run('import', () => importFromDisk())}>导入</button>
          <button className="btn" disabled={busy !== null} onClick={() => run('export', () => exportToDisk())}>导出</button>
          <button className="btn" disabled={busy !== null || !hasUnsavedChanges} onClick={() => run('discard', () => discardChanges())}>放弃草稿</button>
          <button className="btn btn-danger" disabled={busy !== null} onClick={() => {
            if (!window.confirm('确定要恢复默认关卡吗？这会覆盖当前草稿。')) return;
            void run('reset', () => resetToDefault());
          }}>恢复默认</button>
          <button className="btn btn-primary" disabled={busy !== null || !hasUnsavedChanges} onClick={() => run('save', () => saveCatalog())}>
            保存到文件
          </button>
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
  expanded: boolean;
  onToggle: () => void;
  onEditChapter: () => void;
  onMoveChapter: (direction: LevelMoveDirection) => void;
  onDeleteChapter: () => void;
  onAppend: () => void;
  selectedLevelId: string | null;
  busy: string | null;
  guidanceByLevelId: Record<string, ReturnType<typeof getLevelGuidanceSummary>>;
  onSelect: (levelId: string) => void;
  onDuplicate: (levelId: string) => void;
  onToggleHidden: (levelId: string, nextHidden: boolean) => void;
  onMove: (levelId: string, direction: LevelMoveDirection) => void;
  onDelete: (item: LevelManagerItem) => void;
};

function ChapterSection({
  section, expanded, onToggle, onEditChapter, onMoveChapter, onDeleteChapter, onAppend,
  selectedLevelId, busy, guidanceByLevelId, onSelect, onDuplicate, onToggleHidden, onMove, onDelete,
}: ChapterSectionProps) {
  return (
    <div className="chapter-section">
      <div className="chapter-header">
        <button className="chapter-header-toggle" onClick={onToggle}>
          <span className={`chevron ${expanded ? 'chevron-down' : ''}`}>▸</span>
          <div>
            <div className="chapter-eyebrow">{section.partName}</div>
            <div className="chapter-title">{section.chapterLabel}</div>
            <div className="chapter-subtitle">
              {section.configuredCount} 个关卡 · 容量 {section.capacity} · {section.hiddenCount} 个隐藏
            </div>
          </div>
        </button>
        <div className="chapter-actions">
          <button className="icon-btn" disabled={!section.canMoveUp} onClick={() => onMoveChapter('up')}>↑</button>
          <button className="icon-btn" disabled={!section.canMoveDown} onClick={() => onMoveChapter('down')}>↓</button>
          <button className="icon-btn" onClick={onEditChapter}>✎</button>
          <button className="icon-btn" disabled={section.configuredCount > 0} onClick={onDeleteChapter}>🗑</button>
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
              busy={busy}
              guidance={item.level ? guidanceByLevelId[item.level.id] : undefined}
              onSelect={onSelect}
              onDuplicate={onDuplicate}
              onToggleHidden={onToggleHidden}
              onMove={onMove}
              onDelete={onDelete}
            />
          ))}
          <button className="btn btn-ghost btn-block" onClick={onAppend}>+ 新增关卡</button>
        </div>
      )}
    </div>
  );
}

type LevelRowProps = {
  item: LevelManagerItem;
  selected: boolean;
  busy: string | null;
  guidance: ReturnType<typeof getLevelGuidanceSummary> | undefined;
  onSelect: (levelId: string) => void;
  onDuplicate: (levelId: string) => void;
  onToggleHidden: (levelId: string, nextHidden: boolean) => void;
  onMove: (levelId: string, direction: LevelMoveDirection) => void;
  onDelete: (item: LevelManagerItem) => void;
};

function LevelRow({ item, selected, busy, guidance, onSelect, onDuplicate, onToggleHidden, onMove, onDelete }: LevelRowProps) {
  if (!item.level) return null;
  const level = item.level;
  const failureThreshold = resolveLevelGuidanceFailureThreshold(level.guidanceFailureThreshold);
  const disabled = busy !== null;

  return (
    <div className={`level-row ${selected ? 'level-row-selected' : ''}`} onClick={() => onSelect(level.id)}>
      <div className="level-row-main">
        <span className="level-order">{item.orderLabel}</span>
        <span className="level-title">{level.title}</span>
        {item.isHidden && <span className="badge badge-hidden">隐藏</span>}
        <span className={`badge ${guidance?.status === 'ready' ? 'badge-ready' : guidance?.status === 'invalid' ? 'badge-error' : 'badge-muted'}`}>
          {guidance?.status === 'ready' ? `${guidance.stepCount} 步` : guidance?.status === 'invalid' ? '解法无效' : '缺解法'}
        </span>
        <span className="badge badge-muted">失败{failureThreshold}次解锁</span>
      </div>
      <div className="level-row-actions" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn" disabled={disabled} onClick={() => onDuplicate(level.id)}>⧉</button>
        <button className="icon-btn" disabled={disabled} onClick={() => onToggleHidden(level.id, !item.isHidden)}>
          {item.isHidden ? '👁' : '🙈'}
        </button>
        <button className="icon-btn" disabled={disabled || !item.canMoveUp} onClick={() => onMove(level.id, 'up')}>↑</button>
        <button className="icon-btn" disabled={disabled || !item.canMoveDown} onClick={() => onMove(level.id, 'down')}>↓</button>
        <button className="icon-btn icon-btn-danger" disabled={disabled} onClick={() => onDelete(item)}>🗑</button>
      </div>
    </div>
  );
}
