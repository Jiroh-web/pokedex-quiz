import { useState, useEffect } from 'react';
import './App.css';

const REGIONS = [
  { name: 'カントー', start: 1, end: 151 },
  { name: 'ジョウト', start: 152, end: 251 },
  { name: 'ホウエン', start: 252, end: 386 },
  { name: 'シンオウ', start: 387, end: 493 },
  { name: 'イッシュ', start: 494, end: 649 },
  { name: 'カロス', start: 650, end: 721 },
  { name: 'アローラ', start: 722, end: 809 },
  { name: 'ガラル', start: 810, end: 898 },
];

const TOTAL_POKEMON = 898;

function generateRandomIds(count, max) {
  const ids = new Set();
  while (ids.size < count) {
    const randomId = Math.floor(Math.random() * max) + 1;
    ids.add(randomId);
  }
  return Array.from(ids);
}

// ---- localStorage 用のヘルパー関数 ----
// キー名を1箇所にまとめておくとタイプミスを防げる
const STORAGE_KEYS = {
  users: 'pokedexQuizUsers',
  currentUserId: 'pokedexQuizCurrentUserId',
  records: 'pokedexQuizRecords',
};

function loadFromStorage(key, fallback) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveToStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function App() {
  const [mode, setMode] = useState('loading'); // 'loading' / 'login' / 'menu' / 'sequential' / 'random' / 'randomResult' / 'history'
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [currentId, setCurrentId] = useState(null);
  const [pokemon, setPokemon] = useState(null);
  const [japaneseName, setJapaneseName] = useState('');
  const [userAnswer, setUserAnswer] = useState('');
  const [result, setResult] = useState(null);

  const [randomIds, setRandomIds] = useState([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);

  // ---- ユーザー管理用の状態 ----
  const [users, setUsers] = useState([]); // ユーザー一覧
  const [currentUser, setCurrentUser] = useState(null); // ログイン中のユーザー
  const [newUserName, setNewUserName] = useState('');

  // ---- 図鑑機能用の状態 ----
  const [language, setLanguage] = useState('ja'); // 'ja' or 'en'
  const [pokedexRegion, setPokedexRegion] = useState(null);
  const [pokedexEntries, setPokedexEntries] = useState([]);
  const [pokedexLoading, setPokedexLoading] = useState(false);

  // アプリ起動時に一度だけ実行:ユーザー一覧と前回ログイン情報を読み込む
  useEffect(() => {
    const storedUsers = loadFromStorage(STORAGE_KEYS.users, []);
    const storedCurrentUserId = loadFromStorage(STORAGE_KEYS.currentUserId, null);
    setUsers(storedUsers);

    const found = storedUsers.find((u) => u.id === storedCurrentUserId);
    if (found) {
      setCurrentUser(found);
      setMode('modeSelect'); // 前回ログイン情報があれば自動でメニューへ
    } else {
      setMode('login'); // なければユーザー選択画面へ
    }
  }, []);

  useEffect(() => {
    if (currentId === null) return;

    setPokemon(null);
    setResult(null);
    setUserAnswer('');

    fetch(`https://pokeapi.co/api/v2/pokemon/${currentId}`)
      .then((res) => res.json())
      .then((data) => setPokemon(data));

    fetch(`https://pokeapi.co/api/v2/pokemon-species/${currentId}`)
      .then((res) => res.json())
      .then((data) => {
        const jaName = data.names.find((n) => n.language.name === 'ja');
        setJapaneseName(jaName ? jaName.name : '');
      });
  }, [currentId]);

  // 音声リストは非同期で読み込まれることがあるため、事前に読み込んでおく
  useEffect(() => {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }, []);

  // ---- ユーザー選択・作成 ----
  const handleSelectUser = (user) => {
    setCurrentUser(user);
    saveToStorage(STORAGE_KEYS.currentUserId, user.id);
    setMode('modeSelect');
  };

  const handleCreateUser = (e) => {
    e.preventDefault();
    const trimmedName = newUserName.trim();
    if (!trimmedName) return;

    const newUser = { id: Date.now(), name: trimmedName };
    const updatedUsers = [...users, newUser];
    setUsers(updatedUsers);
    saveToStorage(STORAGE_KEYS.users, updatedUsers);

    setNewUserName('');
    handleSelectUser(newUser);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem(STORAGE_KEYS.currentUserId);
    setMode('login');
  };

  // ---- 解答結果の記録 ----
  const recordAnswer = (isCorrect) => {
    const records = loadFromStorage(STORAGE_KEYS.records, []);
    const newRecord = {
      userId: currentUser.id,
      pokemonId: currentId,
      japaneseName,
      isCorrect,
      timestamp: Date.now(),
    };
    const updatedRecords = [...records, newRecord];
    saveToStorage(STORAGE_KEYS.records, updatedRecords);
  };

  // ---- 順番モード ----
  const handleSelectRegion = (region) => {
    setMode('sequential');
    setSelectedRegion(region);
    setCurrentId(region.start);
  };

  const handleNextSequential = () => {
    if (currentId >= selectedRegion.end) {
      backToMenu();
    } else {
      setCurrentId((prevId) => prevId + 1);
    }
  };

  // ---- ランダムモード ----
  const startRandomQuiz = () => {
    const ids = generateRandomIds(10, TOTAL_POKEMON);
    setRandomIds(ids);
    setQuestionIndex(0);
    setScore(0);
    setMode('random');
    setCurrentId(ids[0]);
  };

  const handleNextRandom = () => {
    const nextIndex = questionIndex + 1;
    if (nextIndex >= randomIds.length) {
      setMode('randomResult');
    } else {
      setQuestionIndex(nextIndex);
      setCurrentId(randomIds[nextIndex]);
    }
  };

  // ---- 図鑑機能 ----
const handleSelectPokedexRegion = (region) => {
  setPokedexRegion(region);
  setMode('pokedexList');
  fetchPokedexEntries(region);
};

const fetchPokedexEntries = (region) => {
  setPokedexLoading(true);
  setPokedexEntries([]);

  const ids = [];
  for (let id = region.start; id <= region.end; id++) {
    ids.push(id);
  }

  Promise.all(
    ids.map((id) =>
      Promise.all([
        fetch(`https://pokeapi.co/api/v2/pokemon/${id}`).then((res) => res.json()),
        fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`).then((res) => res.json()),
      ]).then(([p, s]) => {
        const jaEntry = s.names.find((n) => n.language.name === 'ja');
        return {
          id,
          nameJa: jaEntry ? jaEntry.name : p.name,
          nameEn: p.name,
          sprite: p.sprites.front_default,
        };
      })
    )
  ).then((entries) => {
    setPokedexEntries(entries);
    setPokedexLoading(false);
  });
};

const speakEnglishName = (name) => {
  const utterance = new SpeechSynthesisUtterance(name);
  utterance.lang = 'en-US';
  utterance.rate = 0.9;

  // 利用可能な音声の中から、英語(en-US優先)のものを探す
  const voices = window.speechSynthesis.getVoices();
  const englishVoice =
    voices.find((v) => v.lang === 'en-US') ||
    voices.find((v) => v.lang.startsWith('en'));

  if (englishVoice) {
    utterance.voice = englishVoice;
  }

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
};

  // ---- 共通 ----
  const handleSubmit = (e) => {
    e.preventDefault();
    const isCorrect = userAnswer.trim() === japaneseName;
    setResult(isCorrect ? 'correct' : 'wrong');
    if (isCorrect && mode === 'random') {
      setScore((prevScore) => prevScore + 1);
    }
    recordAnswer(isCorrect); // ここで毎回、解答結果をlocalStorageに保存
  };

  const backToMenu = () => {
    setMode('menu');
    setSelectedRegion(null);
    setCurrentId(null);
  };

  // ---- 記録の集計 ----
  const getMyRecords = () => {
    const records = loadFromStorage(STORAGE_KEYS.records, []);
    return records.filter((r) => r.userId === currentUser.id);
  };

  const calculateStats = () => {
    const myRecords = getMyRecords();
    const total = myRecords.length;
    const correctCount = myRecords.filter((r) => r.isCorrect).length;
    const accuracy = total === 0 ? 0 : Math.round((correctCount / total) * 100);

    // 間違えた問題を、ポケモンごとにユニークにまとめる(何回間違えたかも数える)
    const wrongMap = {};
    myRecords
      .filter((r) => !r.isCorrect)
      .forEach((r) => {
        if (!wrongMap[r.pokemonId]) {
          wrongMap[r.pokemonId] = { japaneseName: r.japaneseName, count: 0 };
        }
        wrongMap[r.pokemonId].count += 1;
      });
    const wrongList = Object.entries(wrongMap).map(([pokemonId, info]) => ({
      pokemonId,
      ...info,
    }));

    return { total, correctCount, accuracy, wrongList };
  };

  // ① 読み込み中(localStorageのチェック中)
  if (mode === 'loading') {
    return <p>読み込み中...</p>;
  }

  // ② ログイン画面
  if (mode === 'login') {
    return (
      <div className="pokedex">
        <div className="pokedex-header">
          <span className="lens"></span>
          <span className="lens small"></span>
          <span className="lens small"></span>
        </div>
        <div className="pokedex-screen">
          <h1>ユーザーを えらんでね</h1>
        </div>
        <div className="pokedex-console">
          {users.length > 0 && (
            <>
              <h3>登録済みユーザー</h3>
              {users.map((user) => (
                <button key={user.id} className="dex-button" onClick={() => handleSelectUser(user)}>
                  {user.name}
                </button>
              ))}
            </>
          )}
          <h3>新しいユーザーを作る</h3>
          <form onSubmit={handleCreateUser}>
            <input
              className="dex-input"
              type="text"
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              placeholder="名前を入力"
            />
            <button type="submit" className="dex-button">作成してはじめる</button>
          </form>
        </div>
      </div>
    );
  }

  // モード選択画面(新規)
if (mode === 'modeSelect') {
  return (
    <div className="pokedex">
      <div className="pokedex-header">
        <span className="lens"></span>
        <span className="lens small"></span>
        <span className="lens small"></span>
      </div>
      <div className="pokedex-screen">
        <span className="label">{currentUser.name}さん</span>
        <h1>なにを する?</h1>
      </div>
      <div className="pokedex-console">
        <button className="dex-button" onClick={() => setMode('menu')}>
          クイズに挑戦
        </button>
        <button className="dex-button secondary" onClick={() => setMode('pokedexRegion')}>
          図鑑を見る
        </button>
        <button className="dex-button ghost" onClick={handleLogout}>
          ユーザー切替
        </button>
      </div>
    </div>
  );
}

// 図鑑:地方選択画面(新規)
if (mode === 'pokedexRegion') {
  return (
    <div className="pokedex">
      <div className="pokedex-header">
        <span className="lens"></span>
        <span className="lens small"></span>
        <span className="lens small"></span>
      </div>
      <div className="pokedex-screen">
        <h1>地方を えらんでね</h1>
      </div>
      <div className="pokedex-console">
        <h3>表示言語</h3>
        <button
          className="dex-button secondary"
          onClick={() => setLanguage(language === 'ja' ? 'en' : 'ja')}
        >
          {language === 'ja' ? '日本語(→Englishに切替)' : 'English(→日本語に切替)'}
        </button>

        <h3>地方を選ぶ</h3>
        {REGIONS.map((region) => (
          <button
            key={region.name}
            className="dex-button"
            onClick={() => handleSelectPokedexRegion(region)}
          >
            {region.name}地方(No.{region.start}〜{region.end})
          </button>
        ))}

        <button className="dex-button ghost" onClick={() => setMode('modeSelect')}>
          戻る
        </button>
      </div>
    </div>
  );
}

// 図鑑:一覧表示画面(新規)
if (mode === 'pokedexList') {
  return (
    <div className="pokedex">
      <div className="pokedex-header">
        <span className="lens"></span>
        <span className="lens small"></span>
        <span className="lens small"></span>
      </div>
      <div className="pokedex-screen">
        <span className="label">{pokedexRegion.name}地方図鑑</span>
        <h1>{language === 'ja' ? '日本語' : 'English'}</h1>
      </div>
      <div className="pokedex-console">
        <button
          className="dex-button secondary"
          onClick={() => setLanguage(language === 'ja' ? 'en' : 'ja')}
        >
          {language === 'ja' ? 'Englishに切替' : '日本語に切替'}
        </button>

        {pokedexLoading ? (
          <p>読み込み中...(範囲が広いと時間がかかります)</p>
        ) : (
          <div className="pokedex-grid">
            {pokedexEntries.map((entry) => (
          <div key={entry.id} className="pokedex-grid-item">
            <img src={entry.sprite} alt={entry.nameEn} />
            <p>No.{entry.id}</p>
            <p>{language === 'ja' ? entry.nameJa : entry.nameEn}</p>
            {language === 'en' && (
              <button
                className="speak-button"
                onClick={() => speakEnglishName(entry.nameEn)}
              >
                🔊
              </button>
            )}
          </div>
        ))}
          </div>
        )}

        <button className="dex-button ghost" onClick={() => setMode('pokedexRegion')}>
          地方選択に戻る
        </button>
      </div>
    </div>
  );
}

  // ③ メニュー画面
  if (mode === 'menu') {
    return (
      <div className="pokedex">
        <div className="pokedex-header">
          <span className="lens"></span>
          <span className="lens small"></span>
          <span className="lens small"></span>
        </div>
        <div className="pokedex-screen">
          <span className="label">{currentUser.name}さん</span>
          <h1>モードを えらんでね</h1>
        </div>
        <div className="pokedex-console">
          <h3>地方から選ぶ</h3>
          {REGIONS.map((region) => (
            <button key={region.name} className="dex-button secondary" onClick={() => handleSelectRegion(region)}>
              {region.name}地方(No.{region.start}〜{region.end})
            </button>
          ))}
          <h3>ランダム</h3>
          <button className="dex-button" onClick={startRandomQuiz}>ランダム10問に挑戦</button>
          <h3>記録</h3>
          <button className="dex-button" onClick={() => setMode('history')}>これまでの記録を見る</button>
          <button className="dex-button ghost" onClick={handleLogout}>ユーザー切替</button>
        </div>
      </div>
    );
  }

  // ④ 記録画面
  if (mode === 'history') {
    const { total, correctCount, accuracy, wrongList } = calculateStats();
    return (
      <div className="pokedex">
        <div className="pokedex-header">
          <span className="lens"></span>
          <span className="lens small"></span>
          <span className="lens small"></span>
        </div>
        <div className="pokedex-screen">
          <h1>{currentUser.name}さんの記録</h1>
        </div>
        <div className="pokedex-console">
          <div className="stat-row"><span>答えた問題数</span><span>{total}問</span></div>
          <div className="stat-row"><span>正解数</span><span>{correctCount}問</span></div>
          <div className="stat-row"><span>正答率</span><span>{accuracy}%</span></div>
  
          <h3>間違えたことがあるポケモン</h3>
          {wrongList.length === 0 ? (
            <p>まだ間違えた問題はありません</p>
          ) : (
            <ul className="wrong-list">
              {wrongList.map((item) => (
                <li key={item.pokemonId}>No.{item.pokemonId} {item.japaneseName}(間違えた回数: {item.count}回)</li>
              ))}
            </ul>
          )}
          <button className="dex-button" onClick={backToMenu}>メニューに戻る</button>
        </div>
      </div>
    );
  }

  // ⑤ 結果画面(ランダムモード終了後)
  if (mode === 'randomResult') {
    return (
      <div className="pokedex">
        <div className="pokedex-header">
          <span className="lens"></span>
          <span className="lens small"></span>
          <span className="lens small"></span>
        </div>
        <div className="pokedex-screen">
          <h1>結果発表</h1>
          <p>10問中 {score}問 正解でした！</p>
        </div>
        <div className="pokedex-console">
          <button className="dex-button" onClick={backToMenu}>メニューに戻る</button>
        </div>
      </div>
    );
  }

  // ⑥ データ取得中
  if (!pokemon) {
    return <p>読み込み中...</p>;
  }

  // ⑦ クイズ画面
  return (
    <div className="pokedex">
      <div className="pokedex-header">
        <span className={`lens ${result === 'correct' ? 'correct' : result === 'wrong' ? 'wrong' : ''}`}></span>
        <span className="lens small"></span>
        <span className="lens small"></span>
      </div>
      <div className="pokedex-screen">
        {mode === 'sequential' && <span className="label">{selectedRegion.name}地方</span>}
        {mode === 'random' && <span className="label">第{questionIndex + 1}問/10問(正解{score})</span>}
        <h2>No.{currentId}</h2>
        <img src={pokemon.sprites.front_default} alt="mystery pokemon" />
      </div>
      <div className="pokedex-console">
        <form onSubmit={handleSubmit}>
          <input
            className="dex-input"
            type="text"
            value={userAnswer}
            onChange={(e) => setUserAnswer(e.target.value)}
            placeholder="ポケモンの名前を入力"
          />
          <button type="submit" className="dex-button">答える</button>
        </form>
  
        {result === 'correct' && <p className="result-message correct">正解！ {japaneseName}</p>}
        {result === 'wrong' && <p className="result-message wrong">不正解。正解は「{japaneseName}」でした</p>}
  
        {mode === 'sequential' && <button className="dex-button secondary" onClick={handleNextSequential}>次へ</button>}
        {mode === 'random' && <button className="dex-button secondary" onClick={handleNextRandom}>次へ</button>}
        <button className="dex-button ghost" onClick={backToMenu}>メニューに戻る</button>
      </div>
    </div>
  );
}

export default App;