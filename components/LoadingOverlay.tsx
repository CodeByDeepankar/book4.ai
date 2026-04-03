import { LoaderCircle } from 'lucide-react';

function LoadingOverlay() {
  return (
    <div
      className="loading-wrapper"
      role="status"
      aria-live="polite"
      aria-label="Submitting book upload form"
    >
      <div className="loading-shadow-wrapper bg-(--bg-primary) border border-(--border-subtle) shadow-soft-md">
        <div className="loading-shadow">
          <LoaderCircle className="loading-animation size-12 text-[#663820]" />
          <h2 className="loading-title">Preparing your book for synthesis...</h2>

          <div className="loading-progress">
            <div className="loading-progress-item">
              <span className="loading-progress-status" />
              <span className="text-(--text-secondary)">Validating your uploads</span>
            </div>
            <div className="loading-progress-item">
              <span className="loading-progress-status" />
              <span className="text-(--text-secondary)">Saving book metadata</span>
            </div>
            <div className="loading-progress-item">
              <span className="loading-progress-status" />
              <span className="text-(--text-secondary)">Starting voice synthesis</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoadingOverlay;
