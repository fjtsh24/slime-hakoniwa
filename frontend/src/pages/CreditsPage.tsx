import { Link } from 'react-router-dom'

export function CreditsPage() {
  return (
    <div className="min-h-screen bg-green-50">
      <header className="bg-green-700 text-white shadow px-4 py-3 flex items-center gap-3">
        <Link to="/game" className="text-sm opacity-80 hover:opacity-100">← ゲームに戻る</Link>
        <h1 className="text-xl font-bold">クレジット</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">

        <section className="bg-white rounded-xl shadow p-5">
          <h2 className="text-base font-bold text-gray-700 mb-3">使用素材について</h2>
          <p className="text-xs text-gray-500 mb-4">
            本ゲームでは以下のフリー素材を使用しています。各作者様に感謝申し上げます。
          </p>
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            ※ブラウザゲームのため、ゲーム内で使用している画像素材の抜き出しはご遠慮ください。
          </p>
        </section>

        <section className="bg-white rounded-xl shadow p-5 flex flex-col gap-2">
          <h3 className="text-sm font-bold text-gray-700">モンスタースプライト</h3>
          <p className="text-sm text-gray-600">ドットモンスター 定番セット（スライム）</p>
          <p className="text-xs text-gray-500">制作: SakeSalmon（鮭サーモン）</p>
          <p className="text-xs text-gray-400">© 2022 SakeSalmon</p>
        </section>

        <section className="bg-white rounded-xl shadow p-5 flex flex-col gap-2">
          <h3 className="text-sm font-bold text-gray-700">食料アイコン（果物・食べ物）</h3>
          <p className="text-sm text-gray-600">32pxドット絵フルーツアイコン・食べ物アイコン</p>
          <p className="text-xs text-gray-500">制作: おれんじりりぃ</p>
          <a
            href="https://orangelily.booth.pm/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-green-600 hover:underline"
          >
            https://orangelily.booth.pm/
          </a>
        </section>

        <section className="bg-white rounded-xl shadow p-5 flex flex-col gap-2">
          <h3 className="text-sm font-bold text-gray-700">食料アイコン（薬草・木の実・きのこ）</h3>
          <p className="text-sm text-gray-600">フリーイラスト素材</p>
          <p className="text-xs text-gray-500">制作: ゆきはな / Paper Moon</p>
          <a
            href="https://twitter.com/__yukihana__"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-green-600 hover:underline"
          >
            https://twitter.com/__yukihana__
          </a>
        </section>

      </main>
    </div>
  )
}
