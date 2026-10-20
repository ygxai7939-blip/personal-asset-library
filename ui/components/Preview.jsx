import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Pin, X } from 'lucide-react';
import MagnetContent from './MagnetContent.jsx';

export default function Preview({
  asset,
  nextAsset,
  onClose,
  onPrevious,
  onNext,
  standalone = false,
  notify,
}) {
  const [pinned, setPinned] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    setError(false);
    setZoom(false);
  }, [asset.id]);
  useEffect(() => {
    const key = (event) => {
      if (event.target.matches('input,textarea') || event.target.closest('video')) return;
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onPrevious?.();
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        onNext?.();
      }
      if (event.code === 'Space') {
        event.preventDefault();
        if (asset.kind === 'video') {
          const video = document.querySelector('.preview-stage video');
          video && (video.paused ? video.play().catch(() => {}) : video.pause());
        } else onClose();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [asset, onClose, onPrevious, onNext]);
  const source = `asset-media://library/${asset.id}/file`;
  const nextSource =
    nextAsset && (nextAsset.thumb_status === 'ready' || nextAsset.kind === 'image')
      ? `asset-media://library/${nextAsset.id}/${nextAsset.thumb_status === 'ready' ? 'thumb' : 'file'}`
      : null;
  return (
    <div
      className={`preview-overlay ${standalone ? 'standalone' : ''}`}
      role="dialog"
      aria-label="素材预览"
      aria-modal={!standalone}
    >
      <div className={`preview-stage ${zoom ? 'actual-size' : ''}`}>
        <div className="preview-content">
          <div className="preview-media-viewport">
            {error ? (
              <div className="preview-error">
                <AlertCircle size={28} />
                <h3>暂时无法预览原文件</h3>
                <p>请检查素材格式、NAS 连接，或下载后使用本地软件打开。</p>
              </div>
            ) : asset.kind === 'image' ? (
              <div className="preview-image-frame">
                {nextSource && (
                  <img
                    key={nextAsset.id}
                    className="preview-image-glow"
                    data-next-id={nextAsset.id}
                    src={nextSource}
                    alt=""
                    aria-hidden="true"
                    onError={(event) => {
                      event.currentTarget.style.visibility = 'hidden';
                    }}
                  />
                )}
                <img
                  className="preview-image-main"
                  src={source}
                  alt={asset.name}
                  onError={() => setError(true)}
                />
              </div>
            ) : (
              <video src={source} controls preload="metadata" onError={() => setError(true)} />
            )}
          </div>
          <div className="preview-dock">
            <div className="preview-meta">
              <span className="format-badge inline">{asset.extension.toUpperCase()}</span>
              <div>
                <strong title={asset.name}>{asset.name}</strong>
                <span>{asset.width ? `${asset.width} × ${asset.height}` : '视频素材'}</span>
              </div>
            </div>
            <div className="preview-actions" role="toolbar" aria-label="预览操作">
              {!standalone && (
                <>
                  <button
                    className="preview-nav"
                    title="上一项"
                    aria-label="上一项"
                    onClick={onPrevious}
                  >
                    <MagnetContent compact>
                      <ArrowLeft size={17} />
                    </MagnetContent>
                  </button>
                  <button
                    className="preview-nav"
                    title="下一项"
                    aria-label="下一项"
                    onClick={onNext}
                  >
                    <MagnetContent compact>
                      <ArrowRight size={17} />
                    </MagnetContent>
                  </button>
                </>
              )}
              {asset.kind === 'image' && (
                <button
                  className="preview-zoom"
                  title={zoom ? '适应窗口' : '查看原始尺寸'}
                  onClick={() => setZoom(!zoom)}
                >
                  {zoom ? '适应窗口' : '100%'}
                </button>
              )}
              {standalone ? (
                <button
                  className={pinned ? 'pinned' : ''}
                  onClick={async () => {
                    try {
                      setPinned(await window.library.pinPreview(!pinned));
                    } catch (error) {
                      notify(error.message);
                    }
                  }}
                >
                  <MagnetContent compact>
                    <Pin size={16} />
                    {pinned ? '取消置顶' : '置顶'}
                  </MagnetContent>
                </button>
              ) : (
                <button
                  title="独立参考窗口"
                  aria-label="独立参考窗口"
                  onClick={() =>
                    window.library.previewWindow(asset.id).catch((error) => notify(error.message))
                  }
                >
                  <MagnetContent compact>
                    <Pin size={16} />
                  </MagnetContent>
                </button>
              )}
              <button
                title={standalone ? '关闭参考窗口' : '关闭预览'}
                aria-label={standalone ? '关闭参考窗口' : '关闭预览'}
                onClick={onClose}
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <p className="preview-shortcuts">
            {!standalone && <span>← → 切换素材</span>}
            <span>Esc 关闭</span>
          </p>
        </div>
      </div>
    </div>
  );
}
