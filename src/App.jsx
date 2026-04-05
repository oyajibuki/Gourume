import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Search, Camera, Loader2, Globe, MapPin, Phone, AlertCircle, Settings
} from 'lucide-react';

const GAS_URL = "https://script.google.com/macros/s/AKfycbxjXsyubrqHgW_yQ3TMpu33mIsQMw-gH40ISIAPVSTa30g0AtPlFf137MhyP_tdhm9b/exec";

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result.split(',')[1]);
  reader.onerror = reject;
});

const getDeviceId = () => localStorage.getItem('gourmet_clip_device_id');
const createDeviceId = () => {
  const id = 'device_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  localStorage.setItem('gourmet_clip_device_id', id);
  return id;
};

// ジャンル → 絵文字マッピング
const GENRE_EMOJI = (genre) => {
  if (!genre) return '🍽️';
  const g = genre.toLowerCase();
  if (g.includes('ラーメン') || g.includes('ramen')) return '🍜';
  if (g.includes('寿司') || g.includes('鮨') || g.includes('sushi')) return '🍣';
  if (g.includes('焼肉') || g.includes('肉') || g.includes('ステーキ')) return '🥩';
  if (g.includes('焼き鳥') || g.includes('鳥') || g.includes('chicken')) return '🍗';
  if (g.includes('天ぷら') || g.includes('とんかつ') || g.includes('揚げ')) return '🍤';
  if (g.includes('イタリアン') || g.includes('パスタ') || g.includes('ピザ')) return '🍝';
  if (g.includes('フレンチ') || g.includes('フランス')) return '🥂';
  if (g.includes('中華') || g.includes('餃子') || g.includes('中国')) return '🥟';
  if (g.includes('韓国') || g.includes('チゲ') || g.includes('サムギョプサル')) return '🇰🇷';
  if (g.includes('カレー')) return '🍛';
  if (g.includes('うどん') || g.includes('そば')) return '🍱';
  if (g.includes('バーガー') || g.includes('ハンバーガー')) return '🍔';
  if (g.includes('ピザ')) return '🍕';
  if (g.includes('カフェ') || g.includes('コーヒー') || g.includes('cafe')) return '☕';
  if (g.includes('スイーツ') || g.includes('ケーキ') || g.includes('デザート')) return '🍰';
  if (g.includes('居酒屋') || g.includes('酒') || g.includes('バー')) return '🍺';
  if (g.includes('海鮮') || g.includes('魚') || g.includes('seafood')) return '🐟';
  if (g.includes('和食') || g.includes('日本料理')) return '🍱';
  if (g.includes('鍋') || g.includes('しゃぶしゃぶ') || g.includes('すき焼き')) return '🫕';
  if (g.includes('ハンバーグ') || g.includes('洋食')) return '🍳';
  if (g.includes('タイ') || g.includes('アジア') || g.includes('エスニック')) return '🌶️';
  if (g.includes('スペイン') || g.includes('メキシコ') || g.includes('タコス')) return '🌮';
  if (g.includes('馬肉') || g.includes('ジビエ')) return '🐴';
  return '🍽️';
};

// ==========================================
// ポップアップメニュー（position:fixed で table の overflow を回避）
// ==========================================
function ShopActionPopup({ shop, pos, onVisited, onDelete, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', top: pos.bottom + 4, left: pos.left, zIndex: 9999, minWidth: 160 }}
      className="bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden"
    >
      <button
        onClick={onVisited}
        className="w-full px-4 py-2.5 text-sm text-left hover:bg-orange-50 flex items-center gap-2 text-gray-700"
      >
        <span>{shop.visited ? '⬜' : '✅'}</span>
        <span>{shop.visited ? '未訪問に戻す' : '訪問済みにする'}</span>
      </button>
      <div className="border-t border-gray-100" />
      <button
        onClick={onDelete}
        className="w-full px-4 py-2.5 text-sm text-left hover:bg-red-50 flex items-center gap-2 text-red-500"
      >
        <span>🗑️</span>
        <span>削除する</span>
      </button>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(() => {
    const deviceId = getDeviceId();
    if (!deviceId) return null;
    const savedProfile = localStorage.getItem('gourmet_clip_user');
    const profile = savedProfile ? JSON.parse(savedProfile) : { name: 'ゲスト', ageGroup: '不明', gender: '不明' };
    return { ...profile, id: deviceId };
  });

  const [shops, setShops] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterVisited, setFilterVisited] = useState("all");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [rateLimitError, setRateLimitError] = useState(false);
  const [fetchDebug, setFetchDebug] = useState(null);

  // ポップアップ: shopId + ボタン位置
  const [popup, setPopup] = useState(null); // { shop, pos }

  const fileInputRef = useRef(null);
  const [userName, setUserName] = useState("");
  const [ageGroup, setAgeGroup] = useState("20代");
  const [gender, setGender] = useState("女性");

  useEffect(() => {
    if (user) {
      setIsLoading(true);
      setErrorMessage("");
      fetch(`${GAS_URL}?userId=${user.id}`, { redirect: "follow" })
        .then(res => res.json())
        .then(data => {
          if (data.status === 'success') {
            const list = Array.isArray(data.data) ? data.data : [];
            setShops(list);
            setFetchDebug({ count: list.length, deviceId: user.id });
          } else {
            setErrorMessage(`データ取得エラー: ${data.message}`);
          }
        })
        .catch(() => setErrorMessage("GASとの通信に失敗しました。"))
        .finally(() => setIsLoading(false));
    }
  }, [user]);

  const handleStart = (e) => {
    e.preventDefault();
    if (!userName.trim()) { alert("お名前を入力してください"); return; }
    const deviceId = createDeviceId();
    const newUser = { name: userName, ageGroup, gender, id: deviceId };
    localStorage.setItem('gourmet_clip_user', JSON.stringify(newUser));
    setUser(newUser);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsAnalyzing(true);
    setErrorMessage("");
    setRateLimitError(false);
    try {
      const base64Data = await fileToBase64(file);
      const mimeType = file.type || "image/jpeg";
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

      const response = await fetch(GAS_URL, {
        method: 'POST',
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: 'analyze', userId: user.id, imageBase64: base64Data, mimeType, dateAdded: dateStr }),
        redirect: 'follow'
      });
      const result = await response.json();
      if (result.isRateLimit) { setRateLimitError(true); return; }
      if (result.status !== 'success' || !result.data) throw new Error(result.message || "解析に失敗しました");

      if (result.data.isDuplicate) {
        // 重複: 既存データのメモだけ更新
        setShops(prev => prev.map(s => String(s.id) === String(result.data.id) ? { ...s, userMemo: result.data.userMemo } : s));
      } else {
        setShops(prev => [result.data, ...prev]);
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      alert(`画像の解析に失敗しました。\n${error.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCheckBtn = useCallback((e, shop) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPopup(prev => (prev?.shop.id === shop.id ? null : { shop, pos: rect }));
  }, []);

  const toggleVisited = (shopId) => {
    const targetShop = shops.find(s => s.id === shopId);
    if (!targetShop) return;
    const updatedVisited = !targetShop.visited;
    setShops(shops.map(s => s.id === shopId ? { ...s, visited: updatedVisited } : s));
    setPopup(null);
    fetch(GAS_URL, {
      method: 'POST', headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: 'update', userId: user.id, shop: { id: shopId, visited: updatedVisited, userMemo: targetShop.userMemo } }),
      redirect: 'follow'
    }).catch(console.error);
  };

  const deleteShop = (shopId) => {
    if (!window.confirm(`「${shops.find(s=>s.id===shopId)?.name}」を削除しますか？`)) return;
    setShops(prev => prev.filter(s => s.id !== shopId));
    setPopup(null);
    fetch(GAS_URL, {
      method: 'POST', headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: 'delete', userId: user.id, shopId }),
      redirect: 'follow'
    }).catch(console.error);
  };

  const updateMemo = (shopId, newMemo) => setShops(shops.map(s => s.id === shopId ? { ...s, userMemo: newMemo } : s));

  const saveMemoToSheet = (shopId) => {
    const targetShop = shops.find(s => s.id === shopId);
    if (!targetShop) return;
    fetch(GAS_URL, {
      method: 'POST', headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: 'update', userId: user.id, shop: { id: shopId, visited: targetShop.visited, userMemo: targetShop.userMemo } }),
      redirect: 'follow'
    }).catch(console.error);
  };

  const handleEditProfile = () => {
    const newName = window.prompt("新しいニックネームを入力してください", user.name);
    if (!newName?.trim()) return;
    const updatedUser = { ...user, name: newName.trim() };
    localStorage.setItem('gourmet_clip_user', JSON.stringify(updatedUser));
    setUser(updatedUser);
  };

  const filteredShops = useMemo(() => shops.filter(shop => {
    const matchQuery = !searchQuery ||
      shop.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      shop.area?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      shop.genre?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      shop.prefecture?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchVisited = filterVisited === "all" ? true : filterVisited === "visited" ? shop.visited === true : !shop.visited;
    return matchQuery && matchVisited;
  }), [shops, searchQuery, filterVisited]);

  const groupedShops = useMemo(() => {
    const groups = {};
    filteredShops.forEach(shop => {
      if (!groups[shop.prefecture]) groups[shop.prefecture] = {};
      if (!groups[shop.prefecture][shop.area]) groups[shop.prefecture][shop.area] = [];
      groups[shop.prefecture][shop.area].push(shop);
    });
    return groups;
  }, [filteredShops]);

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md">
          <div className="flex justify-center mb-6">
            <div className="bg-orange-100 p-3 rounded-full text-orange-600"><Camera size={40} /></div>
          </div>
          <h1 className="text-2xl font-bold text-center text-gray-800 mb-2">GourmetClip</h1>
          <p className="text-center text-gray-500 text-sm mb-8">面倒な登録なし！あなただけのリストを作ろう</p>
          <form onSubmit={handleStart} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">お名前（ニックネーム）</label>
              <input type="text" required placeholder="例：グルメ太郎" value={userName} onChange={e => setUserName(e.target.value)}
                className="w-full border border-gray-300 rounded-xl p-3 bg-gray-50 outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">年代</label>
              <select value={ageGroup} onChange={e => setAgeGroup(e.target.value)}
                className="w-full border border-gray-300 rounded-xl p-3 bg-gray-50 outline-none focus:ring-2 focus:ring-orange-500">
                <option>10代</option><option>20代</option><option>30代</option><option>40代</option><option>50代以上</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">性別</label>
              <select value={gender} onChange={e => setGender(e.target.value)}
                className="w-full border border-gray-300 rounded-xl p-3 bg-gray-50 outline-none focus:ring-2 focus:ring-orange-500">
                <option>女性</option><option>男性</option><option>その他</option>
              </select>
            </div>
            <button type="submit" className="w-full bg-orange-600 text-white font-bold py-3 rounded-xl hover:bg-orange-700 transition-colors shadow-md">
              はじめる
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-800 flex flex-col">
      {/* ポップアップ（fixed・table の外に描画） */}
      {popup && (
        <ShopActionPopup
          shop={popup.shop}
          pos={popup.pos}
          onVisited={() => toggleVisited(popup.shop.id)}
          onDelete={() => deleteShop(popup.shop.id)}
          onClose={() => setPopup(null)}
        />
      )}

      <header className="bg-white sticky top-0 z-10 shadow-sm flex-shrink-0">
        <div className="p-4 flex flex-col md:flex-row md:justify-between md:items-center gap-4 border-b border-gray-100">
          <div className="flex justify-between items-center w-full md:w-auto">
            <h1 className="text-xl font-bold text-orange-600 flex items-center gap-2">
              <Camera size={24} />{user.name}のGourmetClip
            </h1>
            <div className="flex items-center gap-2">
              <button onClick={handleEditProfile} className="p-2 text-gray-400 hover:text-gray-600 transition-colors md:hidden" title="プロフィール変更">
                <Settings size={18} />
              </button>
              <button onClick={() => fileInputRef.current?.click()} disabled={isAnalyzing}
                className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-orange-700 transition-colors disabled:opacity-50 md:hidden">
                {isAnalyzing ? <Loader2 size={16} className="animate-spin" /> : "+ 追加"}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto flex-1 md:max-w-xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input type="text" placeholder="店名やエリアで検索..."
                className="w-full bg-gray-100 rounded-lg py-2 pl-10 pr-4 outline-none focus:ring-2 focus:ring-orange-500 transition-all text-sm"
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            <select className="bg-gray-100 rounded-lg py-2 px-3 text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-orange-500 flex-shrink-0 cursor-pointer"
              value={filterVisited} onChange={e => setFilterVisited(e.target.value)}>
              <option value="all">状況: すべて</option>
              <option value="unvisited">未訪問のみ</option>
              <option value="visited">訪問済のみ</option>
            </select>
            <button onClick={() => fileInputRef.current?.click()} disabled={isAnalyzing}
              className="hidden md:flex bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-bold items-center gap-2 hover:bg-orange-700 transition-colors whitespace-nowrap flex-shrink-0 disabled:opacity-50">
              {isAnalyzing ? <><Loader2 size={16} className="animate-spin" /> 解析中...</> : "+ スクショ追加"}
            </button>
            <button onClick={handleEditProfile} className="hidden md:flex p-2 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0" title="プロフィール変更">
              <Settings size={20} />
            </button>
          </div>
          <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageUpload} />
        </div>

        {rateLimitError && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-start gap-3">
            <AlertCircle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <p className="font-bold text-amber-800">⚠️ APIの利用制限に達しました</p>
              <p className="text-amber-700">無料枠の上限：<span className="font-medium">1分間に10回</span> または <span className="font-medium">1日に500回</span>まで</p>
              <p className="text-amber-600 text-xs mt-1">1分待つか、本日の上限に達した場合は明日（0時リセット）再度お試しください。</p>
            </div>
            <button onClick={() => setRateLimitError(false)} className="text-amber-400 hover:text-amber-600 text-xs flex-shrink-0">✕</button>
          </div>
        )}
      </header>

      <main className="flex-1 p-4 md:p-6 overflow-hidden flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-gray-400">
            <Loader2 size={32} className="animate-spin mb-4 text-orange-500" />
            <p>スプレッドシートからデータを読み込んでいます...</p>
          </div>
        ) : errorMessage ? (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
            <AlertCircle size={48} className="text-red-500 mb-4" />
            <p className="font-bold text-gray-800 mb-2">{errorMessage}</p>
            <button onClick={() => window.location.reload()}
              className="mt-6 bg-orange-100 text-orange-600 px-4 py-2 rounded-lg text-sm font-bold hover:bg-orange-200 transition-colors">
              再読み込みする
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex-1 overflow-hidden flex flex-col">
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse min-w-[1100px]">
                <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="py-3 px-3 text-xs font-semibold text-gray-500 uppercase text-center w-12">訪問</th>
                    <th className="py-3 px-3 text-xs font-semibold text-gray-500 uppercase text-center w-16">写真</th>
                    <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase w-40">店名</th>
                    <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase w-20">ジャンル</th>
                    <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase w-24">営業時間</th>
                    <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase w-28">予算</th>
                    <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase w-24">登録日</th>
                    <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase text-center w-16">予約</th>
                    <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase w-44">メモ</th>
                    <th className="py-3 px-3 text-xs font-semibold text-gray-500 uppercase text-center w-12">📞</th>
                    <th className="py-3 px-3 text-xs font-semibold text-gray-500 uppercase text-center w-12">🌐</th>
                    <th className="py-3 px-3 text-xs font-semibold text-gray-500 uppercase text-center w-12">📍</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {Object.keys(groupedShops).length === 0 ? (
                    <tr>
                      <td colSpan="12" className="py-16 text-center text-gray-400">
                        <div className="flex flex-col items-center gap-3">
                          <Camera size={40} className="text-orange-300" />
                          {fetchDebug !== null && fetchDebug.count > 0 ? (
                            <>
                              <p className="font-medium text-amber-600">⚠️ {fetchDebug.count}件取得できましたが表示できません</p>
                              <p className="text-xs font-mono bg-gray-100 px-3 py-1 rounded">device_id: {fetchDebug.deviceId}</p>
                            </>
                          ) : fetchDebug !== null ? (
                            <>
                              <p className="font-medium">このデバイスのデータは見つかりませんでした</p>
                              <p className="text-xs font-mono bg-gray-100 px-3 py-1 rounded">device_id: {fetchDebug.deviceId}</p>
                              <p className="text-sm">「＋ スクショ追加」から登録しよう！</p>
                            </>
                          ) : (
                            <>
                              <p className="font-medium">まだお店がありません</p>
                              <p className="text-sm">「＋ スクショ追加」からSNSの飲食店スクショを登録しよう！</p>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    Object.entries(groupedShops).map(([prefecture, areas]) => (
                      <React.Fragment key={prefecture}>
                        <tr className="bg-gray-100">
                          <td colSpan="12" className="py-2 px-4 font-bold text-gray-800 text-sm border-y border-gray-200">
                            📍 {prefecture}
                          </td>
                        </tr>
                        {Object.entries(areas).map(([area, areaShops]) => (
                          <React.Fragment key={area}>
                            <tr className="bg-orange-50/50">
                              <td colSpan="12" className="py-1.5 px-6 font-semibold text-orange-800 text-xs border-b border-orange-100">
                                └ {area}
                              </td>
                            </tr>
                            {areaShops.map((shop) => (
                              <tr key={shop.id} className={`hover:bg-gray-50 transition-colors ${shop.visited ? 'bg-gray-50 opacity-60' : ''}`}>

                                {/* ── 訪問チェック → ポップアップ ── */}
                                <td className="py-3 px-3 text-center">
                                  <button
                                    onClick={e => handleCheckBtn(e, shop)}
                                    className={`w-6 h-6 rounded border-2 inline-flex items-center justify-center cursor-pointer transition-colors ${shop.visited ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-300 hover:border-orange-400'}`}
                                    title="クリックでメニュー"
                                  >
                                    {shop.visited && <span className="text-xs font-bold leading-none">✓</span>}
                                  </button>
                                </td>

                                {/* ── ジャンル絵文字アイコン ── */}
                                <td className="py-2 px-3 text-center">
                                  <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center mx-auto text-2xl border border-orange-100">
                                    {GENRE_EMOJI(shop.genre)}
                                  </div>
                                </td>

                                <td className="py-3 px-4 text-sm font-bold text-gray-900">{shop.name}</td>
                                <td className="py-3 px-4 text-sm text-gray-600">
                                  <span className="bg-gray-100 px-2 py-1 rounded-md text-xs whitespace-nowrap">{shop.genre}</span>
                                </td>
                                <td className="py-3 px-4 text-xs text-gray-600">{shop.hours}</td>
                                <td className="py-3 px-4 text-xs text-gray-600">{shop.budget}</td>
                                <td className="py-3 px-4 text-xs text-gray-400">{shop.dateAdded}</td>
                                <td className="py-3 px-4 text-sm text-center font-medium text-gray-700">{shop.reservable}</td>
                                <td className="py-3 px-4">
                                  <input type="text" placeholder="訪問日や感想..."
                                    value={shop.userMemo || ""}
                                    onChange={e => updateMemo(shop.id, e.target.value)}
                                    onBlur={() => saveMemoToSheet(shop.id)}
                                    className="w-full text-xs p-1.5 border border-transparent hover:border-gray-200 focus:border-orange-500 rounded bg-transparent focus:bg-white transition-all outline-none"
                                  />
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <a href={shop.phone && shop.phone !== "非公開" && shop.phone !== "-" ? `tel:${shop.phone}` : "#"}
                                    className={`inline-flex p-2 rounded-full ${shop.phone && shop.phone !== "非公開" && shop.phone !== "-" ? 'bg-green-100 text-green-600 hover:bg-green-200' : 'bg-gray-100 text-gray-300 cursor-not-allowed'}`}>
                                    <Phone size={15} />
                                  </a>
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <a href={shop.webUrl && shop.webUrl !== "#" ? shop.webUrl : "#"} target="_blank" rel="noopener noreferrer"
                                    className={`inline-flex p-2 rounded-full ${shop.webUrl && shop.webUrl !== "#" ? 'bg-blue-100 text-blue-600 hover:bg-blue-200' : 'bg-gray-100 text-gray-300 cursor-not-allowed'}`}>
                                    <Globe size={15} />
                                  </a>
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <a href={`https://maps.google.com/?q=${encodeURIComponent(shop.address || shop.name)}`} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex p-2 rounded-full bg-red-100 text-red-600 hover:bg-red-200">
                                    <MapPin size={15} />
                                  </a>
                                </td>
                              </tr>
                            ))}
                          </React.Fragment>
                        ))}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
