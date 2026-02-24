import { open } from '@tauri-apps/plugin-shell';

const KOFI_URL = 'https://ko-fi.com/morphlight';

export default function AboutTab() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold mb-1">Morph</h2>
        <p className="text-sm text-gray-500">Version 0.1.0</p>
        <p className="text-sm text-gray-600 mt-2">
          Ambient screen border overlay that changes color based on upcoming calendar events. Built
          for people with time blindness.
        </p>
      </div>

      <section>
        <p className="text-sm font-medium text-gray-900 mb-3">Support Morph</p>
        <p className="text-sm text-gray-600 mb-3">
          Morph is free and open source. If it helps you, consider supporting development.
        </p>
        <button
          onClick={() => open(KOFI_URL)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FF5E5B] hover:bg-[#e54e4b] text-white text-sm font-medium transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
          Support Morph on Ko-fi
        </button>
      </section>

      <section>
        <p className="text-sm font-medium text-gray-900 mb-2">Links</p>
        <div className="flex flex-col gap-1.5">
          <button
            onClick={() => open('https://github.com/thegian7/Morph')}
            className="text-sm text-blue-600 hover:text-blue-700 hover:underline text-left"
          >
            GitHub
          </button>
          <button
            onClick={() => open('https://github.com/thegian7/Morph/issues')}
            className="text-sm text-blue-600 hover:text-blue-700 hover:underline text-left"
          >
            Report an Issue
          </button>
        </div>
      </section>

      <section>
        <p className="text-sm font-medium text-gray-900 mb-1">License</p>
        <p className="text-sm text-gray-600">GPL-3.0</p>
      </section>
    </div>
  );
}
