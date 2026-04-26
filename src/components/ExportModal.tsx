import { Download, CheckCircle2, AlertCircle, X, Loader } from 'lucide-react';
import type { ExportStatus } from '../hooks/useVideoExport';

interface Props {
  status:    ExportStatus;
  progress:  number;
  phase:     string;
  error:     string | null;
  canExport: boolean;
  onExport:  () => void;
  onCancel:  () => void;
  onClose:   () => void;
}

export default function ExportModal({
  status, progress, phase, error, canExport, onExport, onCancel, onClose,
}: Props) {
  const busy = status === 'loading-ffmpeg' || status === 'recording' || status === 'encoding';

  return (
    <div className="modal-overlay" onClick={!busy ? onClose : undefined}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <span className="modal-title">MP4書き出し</span>
          {!busy && (
            <button className="modal-close" onClick={onClose}>
              <X size={16} />
            </button>
          )}
        </div>

        <div className="ex-body">

          {/* ── Idle ── */}
          {status === 'idle' && (
            <>
              <ul className="ex-feature-list">
                <li>✓ 複数クリップの順番どおり結合</li>
                <li>✓ 再生速度・トリムの適用</li>
                <li>✓ テロップの焼き込み（日本語対応）</li>
                <li>✓ 挿入画像の合成</li>
                <li>✓ BGMの合成（フェードイン・アウト）</li>
              </ul>
              <div className="ex-notes">
                <p>※ 書き出し時間は動画の総再生時間と同程度かかります</p>
                <p>※ 初回起動時にFFmpeg（約33MB）をダウンロードします</p>
                <p>※ 出力解像度: 1280×720 / H.264+AAC / MP4</p>
              </div>
              {!canExport && (
                <div className="ex-warning">
                  ⚠ ファイル未ロードのクリップがあります。<br />
                  クリップタブで再アップロードしてください。
                </div>
              )}
              <button className="btn-primary" onClick={onExport} disabled={!canExport}>
                <Download size={16} /> 書き出し開始
              </button>
            </>
          )}

          {/* ── Busy ── */}
          {busy && (
            <div className="ex-progress-wrap">
              <div className="ex-steps">
                <Step
                  label="FFmpeg"
                  active={status === 'loading-ffmpeg'}
                  done={status === 'recording' || status === 'encoding' || status === 'done'}
                />
                <div className="ex-step-line" />
                <Step
                  label="録画"
                  active={status === 'recording'}
                  done={status === 'encoding' || status === 'done'}
                />
                <div className="ex-step-line" />
                <Step
                  label="MP4変換"
                  active={status === 'encoding'}
                  done={status === 'done'}
                />
              </div>

              <div className="ex-bar-track">
                <div className="ex-bar-fill" style={{ width: `${progress}%` }} />
              </div>
              <p className="ex-pct">{progress}%</p>
              <p className="ex-phase">{phase}</p>
              <p className="ex-warn-small">ブラウザを閉じないでください</p>

              <button className="btn-secondary" style={{ marginTop: 16 }} onClick={onCancel}>
                キャンセル
              </button>
            </div>
          )}

          {/* ── Done ── */}
          {status === 'done' && (
            <div className="ex-result">
              <CheckCircle2 size={48} color="var(--success)" />
              <p className="ex-result-title">書き出し完了！</p>
              <p className="ex-result-sub">ダウンロードが開始されました</p>
              <button className="btn-primary" onClick={onClose}>閉じる</button>
            </div>
          )}

          {/* ── Error ── */}
          {status === 'error' && (
            <div className="ex-result">
              <AlertCircle size={48} color="var(--danger)" />
              <p className="ex-result-title">書き出しに失敗しました</p>
              <p className="ex-error-msg">{error}</p>
              <button className="btn-primary" onClick={onExport}>再試行</button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function Step({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <div className="ex-step">
      <div className={`ex-step-dot${active ? ' active' : done ? ' done' : ''}`}>
        {done
          ? <CheckCircle2 size={12} />
          : active
            ? <Loader size={10} className="spin" />
            : null}
      </div>
      <span className="ex-step-label">{label}</span>
    </div>
  );
}
