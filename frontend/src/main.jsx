import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createOrder, fetchOrders, generateAvatars, syncProfile, updateOrder, uploadPhoto } from "./api.js";
import { isSupabaseConfigured, supabase } from "./supabaseClient.js";
import "./styles.css";

const examples = [
  { title: "Лиза и волшебный лес", category: "Для ребенка", src: "/assets/example-child.png", price: 1490 },
  { title: "Ты — моя вселенная", category: "История любви", src: "/assets/example-love.png", price: 1990 },
  { title: "Праздник-сюрприз", category: "День рождения", src: "/assets/example-birthday.png", price: 1490 },
  { title: "Свадебная история", category: "Свадьба", src: "/assets/example-love.png", price: 1990 },
];

const occasionOptions = [
  { label: "Для ребенка", price: 1490 },
  { label: "История любви", price: 1990 },
  { label: "День рождения", price: 1490 },
  { label: "Свадьба", price: 1990 },
];

const storyOptions = [
  { title: "Волшебное приключение", text: "Герой попадает в сказочный мир и находит чудо." },
  { title: "Теплая история", text: "Спокойный мультфильм про семью, любовь и заботу." },
  { title: "Праздничный сюрприз", text: "Поздравление с подарками и финальным вау-моментом." },
];

const nav = [
  ["create", "+", "Создать"],
  ["works", "□", "Мои работы"],
  ["examples", "◇", "Примеры"],
  ["gift", "☆", "Подарок"],
  ["profile", "○", "Профиль"],
];

const yandexProvider = import.meta.env.VITE_YANDEX_PROVIDER || "custom:yandex";
const vkProvider = import.meta.env.VITE_VK_PROVIDER || "custom:vk";

const statusLabels = {
  draft: "Черновик",
  generating_avatars: "Создается",
  avatars_ready: "Образы готовы",
  awaiting_payment: "Ожидает оплаты",
  creating_movie: "Создается",
  ready: "Готово",
};

function formatPrice(value) {
  return `${Number(value || 0).toLocaleString("ru-RU")} ₽`;
}

function getToken(session) {
  return session?.access_token;
}

async function fileToOptimizedDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать фото"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Не удалось обработать фото"));
      image.onload = () => {
        const maxSize = 768;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function App() {
  const [session, setSession] = useState(null);
  const [view, setView] = useState("create");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [selectedAvatarId, setSelectedAvatarId] = useState(null);
  const [exampleCategory, setExampleCategory] = useState("Все");
  const [form, setForm] = useState({
    heroName: "Лиза",
    age: "7 лет",
    occasion: "Для ребенка",
    story: "Волшебное приключение",
    price: 1490,
    imageDataUrl: "",
    sourcePhotoPath: "",
  });

  const token = getToken(session);
  const signedIn = Boolean(session?.user);

  function notify(message) {
    setToast(message);
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => setToast(""), 2600);
  }

  async function refreshOrders(nextToken = token) {
    if (!nextToken) return;
    const data = await fetchOrders(nextToken);
    setOrders(data.orders || []);
  }

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      setView("login");
      return;
    }

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) {
        await syncProfile(data.session.access_token);
        await refreshOrders(data.session.access_token);
      }
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        await syncProfile(nextSession.access_token);
        await refreshOrders(nextSession.access_token);
        setView("create");
      } else {
        setOrders([]);
        setView("login");
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    window.location.hash = view;
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [view]);

  const filteredExamples = useMemo(
    () => examples.filter((item) => exampleCategory === "Все" || item.category === exampleCategory),
    [exampleCategory]
  );

  async function signInWithEmail(event, mode) {
    event.preventDefault();
    if (!supabase) return notify("Заполните VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY.");
    const formData = new FormData(event.currentTarget);
    const email = formData.get("email");
    const password = formData.get("password");
    const redirectTo = `${window.location.origin}/cabinet`;
    const result =
      mode === "signup"
        ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } })
        : await supabase.auth.signInWithPassword({ email, password });

    if (result.error) return notify(result.error.message);
    notify(mode === "signup" ? "Письмо подтверждения отправлено." : "Вы вошли в кабинет.");
  }

  async function signInWithMagicLink(event) {
    event.preventDefault();
    if (!supabase) return notify("Заполните env Supabase.");
    const email = new FormData(event.currentTarget).get("email");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/cabinet` },
    });
    if (error) return notify(error.message);
    notify("Ссылка для входа отправлена на почту.");
  }

  async function signInWithProvider(provider) {
    if (!supabase) return notify("Заполните env Supabase.");
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/cabinet` },
    });
    if (error) notify(error.message);
  }

  async function handlePhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return notify("Загрузите изображение JPG или PNG.");
    const imageDataUrl = await fileToOptimizedDataUrl(file);
    setForm((prev) => ({ ...prev, imageDataUrl }));
  }

  async function createAndGenerate(event) {
    event.preventDefault();
    if (!signedIn) return setView("login");
    if (!form.imageDataUrl) return notify("Сначала загрузите фото героя.");
    setView("generating");

    try {
      const upload = await uploadPhoto(token, form.imageDataUrl);
      const created = await createOrder(token, {
        heroName: form.heroName,
        age: form.age,
        occasion: form.occasion,
        story: form.story,
        price: form.price,
        sourcePhotoPath: upload.path,
      });
      const generated = await generateAvatars(token, {
        orderId: created.order.id,
        imageDataUrl: form.imageDataUrl,
      });
      const order = { ...created.order, status: "avatars_ready", avatars: generated.avatars };
      setCurrentOrder(order);
      setSelectedAvatarId(generated.avatars?.[0]?.id || null);
      await refreshOrders();
      setView("avatars");
      if ((generated.avatars || []).length < 3) notify(`Модель вернула ${generated.avatars.length} из 3.`);
    } catch (error) {
      notify(error.message);
      setView("create");
    }
  }

  async function continueWithAvatar() {
    if (!currentOrder || !selectedAvatarId) return;
    const updated = await updateOrder(token, currentOrder.id, {
      selected_avatar_id: selectedAvatarId,
      status: "awaiting_payment",
    });
    setCurrentOrder({ ...currentOrder, ...updated.order });
    await refreshOrders();
    setView("payment");
  }

  async function markPaymentPending() {
    if (!currentOrder) return;
    await updateOrder(token, currentOrder.id, { status: "awaiting_payment" });
    await refreshOrders();
    notify("Заказ сохранен. CloudPayments подключим следующим шагом.");
  }

  if (loading) {
    return <Shell view="generating"><Loader title="Загружаем кабинет" text="Проверяем сессию" /></Shell>;
  }

  return (
    <Shell view={view} setView={setView} signedIn={signedIn} user={session?.user}>
      {view === "login" && (
        <AuthScreen
          onEmail={signInWithEmail}
          onMagic={signInWithMagicLink}
          onOAuth={signInWithProvider}
          configured={isSupabaseConfigured}
        />
      )}
      {view === "create" && signedIn && (
        <CreateScreen form={form} setForm={setForm} onPhoto={handlePhoto} onSubmit={createAndGenerate} />
      )}
      {view === "generating" && <Loader title="Создаем 3 образа героя" text="Готовим варианты персонажа" />}
      {view === "avatars" && signedIn && (
        <AvatarScreen order={currentOrder} selectedId={selectedAvatarId} setSelectedId={setSelectedAvatarId} onContinue={continueWithAvatar} />
      )}
      {view === "payment" && signedIn && <PaymentScreen order={currentOrder} selectedAvatarId={selectedAvatarId} onPay={markPaymentPending} />}
      {view === "works" && signedIn && <WorksScreen orders={orders} setView={setView} setCurrentOrder={setCurrentOrder} />}
      {view === "examples" && (
        <ExamplesScreen category={exampleCategory} setCategory={setExampleCategory} items={filteredExamples} setForm={setForm} setView={setView} />
      )}
      {view === "gift" && signedIn && <GiftScreen notify={notify} />}
      {view === "profile" && signedIn && <ProfileScreen user={session.user} orders={orders} onLogout={() => supabase.auth.signOut()} />}
      {!signedIn && view !== "login" && view !== "examples" && <AuthScreen onEmail={signInWithEmail} onMagic={signInWithMagicLink} onOAuth={signInWithProvider} configured={isSupabaseConfigured} />}
      {toast && <div className="toast">{toast}</div>}
    </Shell>
  );
}

function Shell({ children, view, setView, signedIn, user }) {
  const showNav = signedIn && !["login", "generating"].includes(view);
  return (
    <main className="app-shell">
      {signedIn && view !== "generating" && (
        <header className="app-bar">
          <button className="app-back" type="button" onClick={() => setView?.("create")}>←</button>
          <div><span>Личный кабинет</span><strong>Мультфильмы по фото</strong></div>
          <button className="profile-dot" type="button" onClick={() => setView?.("profile")}>{(user?.email || "Л")[0].toUpperCase()}</button>
        </header>
      )}
      <section className={`screen is-active ${view === "login" ? "auth-screen" : ""} ${view === "generating" ? "center-screen" : ""}`}>{children}</section>
      {showNav && (
        <nav className="bottom-nav">
          {nav.map(([id, icon, label]) => (
            <button key={id} className={view === id ? "is-active" : ""} type="button" onClick={() => setView(id)}>
              <span>{icon}</span>{label}
            </button>
          ))}
        </nav>
      )}
    </main>
  );
}

function AuthScreen({ onEmail, onMagic, onOAuth, configured }) {
  return (
    <>
      <div className="auth-hero">
        <span className="soft-kicker">Вход</span>
        <h1>Создайте мультфильм по фото</h1>
        <p>Войдите, чтобы сохранить черновики, выбранных героев и готовые мультфильмы.</p>
      </div>
      {!configured && <div className="trust-note"><h2>Нужны env</h2><p>Заполните VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в Vercel или локальном .env.</p></div>}
      <form className="panel auth-form" onSubmit={(event) => onEmail(event, "signin")}>
        <label className="field"><span>Email</span><input name="email" type="email" required placeholder="you@example.com" /></label>
        <label className="field"><span>Пароль</span><input name="password" type="password" minLength="6" required placeholder="Минимум 6 символов" /></label>
        <button className="primary-btn" type="submit">Войти</button>
        <button
          className="ghost-btn"
          type="button"
          onClick={(event) => onEmail({ preventDefault() {}, currentTarget: event.currentTarget.form }, "signup")}
        >
          Зарегистрироваться
        </button>
      </form>
      <form className="panel auth-form" onSubmit={onMagic}>
        <label className="field"><span>Войти по ссылке</span><input name="email" type="email" required placeholder="you@example.com" /></label>
        <button className="primary-btn" type="submit">Отправить письмо подтверждения</button>
      </form>
      <div className="auth-social">
        <button type="button" onClick={() => onOAuth(yandexProvider)}>Войти через Яндекс ID</button>
        <button type="button" onClick={() => onOAuth(vkProvider)}>Войти через VK</button>
      </div>
    </>
  );
}

function CreateScreen({ form, setForm, onPhoto, onSubmit }) {
  function chooseOccasion(option) {
    setForm((prev) => ({ ...prev, occasion: option.label, price: option.price }));
  }
  return (
    <>
      <Head kicker="Создать" title="Новый мультфильм" text="Сначала бесплатно подготовим 3 образа героя. Оплата появится только после выбора." />
      <form className="create-form" onSubmit={onSubmit}>
        <label className={`upload-card ${form.imageDataUrl ? "has-photo" : ""}`}>
          <input type="file" accept="image/*" onChange={onPhoto} />
          {form.imageDataUrl && <img src={form.imageDataUrl} alt="" />}
          <span className="upload-icon">+</span>
          <strong>{form.imageDataUrl ? "Фото загружено" : "Загрузите фото героя"}</strong>
          <small>{form.imageDataUrl ? "Можно заменить фото или сразу создать 3 образа." : "Лучше подойдет четкое фото лица при хорошем освещении."}</small>
        </label>
        <div className="field-grid">
          <label className="field"><span>Имя героя</span><input value={form.heroName} onChange={(e) => setForm({ ...form, heroName: e.target.value })} /></label>
          <label className="field"><span>Возраст</span><input value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} /></label>
        </div>
        <div className="form-block">
          <h2>Повод</h2>
          <div className="chip-grid">{occasionOptions.map((option) => <button key={option.label} className={`chip ${form.occasion === option.label ? "is-active" : ""}`} type="button" onClick={() => chooseOccasion(option)}>{option.label}</button>)}</div>
        </div>
        <div className="form-block">
          <h2>Сюжет</h2>
          <div className="story-list">{storyOptions.map((story) => <button key={story.title} className={`story-card ${form.story === story.title ? "is-active" : ""}`} type="button" onClick={() => setForm({ ...form, story: story.title })}><strong>{story.title}</strong><span>{story.text}</span></button>)}</div>
        </div>
        <button className="primary-btn sticky-btn" type="submit">Создать 3 образа бесплатно</button>
        <p className="trust-line">Оплата только после выбора образа.</p>
      </form>
    </>
  );
}

function AvatarScreen({ order, selectedId, setSelectedId, onContinue }) {
  const avatars = order?.avatars || [];
  return (
    <>
      <Head kicker="Образы готовы" title="Выберите героя для мультфильма" text="Мы бесплатно подготовили 3 варианта. Нажмите на карточку, чтобы выбрать образ." />
      <div className="avatar-list">
        {avatars.map((avatar) => (
          <button key={avatar.id} className={`avatar-card ${selectedId === avatar.id ? "is-selected" : ""}`} type="button" onClick={() => setSelectedId(avatar.id)}>
            <img src={avatar.signed_url} alt={avatar.title} />
            <div><span>{selectedId === avatar.id ? "Выбран" : "Вариант"}</span><h2>{avatar.title}</h2><p>Нейтральный мульт-образ персонажа без сюжетных деталей.</p></div>
            {selectedId === avatar.id && <b>✓</b>}
          </button>
        ))}
      </div>
      <button className="primary-btn sticky-btn" type="button" onClick={onContinue} disabled={!selectedId}>Продолжить с этим образом</button>
    </>
  );
}

function PaymentScreen({ order, selectedAvatarId, onPay }) {
  const avatar = order?.avatars?.find((item) => item.id === selectedAvatarId) || order?.avatars?.[0];
  return (
    <>
      <Head kicker="Оплата" title="Ваш мультфильм почти готов" text="Вы выбрали героя. Теперь можно оплатить создание одного мультфильма." />
      <article className="checkout-card panel">{avatar && <img src={avatar.signed_url} alt="" />}<div><span>{order?.occasion}</span><h2>{order?.hero_name || "Герой"} и волшебная история</h2><p>{order?.story} по выбранному образу.</p></div></article>
      <article className="price-card"><span>Цена за 1 мультфильм</span><strong>{formatPrice(order?.price)}</strong><p>Без токенов и подписок. CloudPayments подключается отдельными ключами.</p></article>
      <button className="primary-btn sticky-btn" type="button" onClick={onPay}>Оплатить и создать мультфильм</button>
    </>
  );
}

function WorksScreen({ orders, setView, setCurrentOrder }) {
  return (
    <>
      <Head kicker="Кабинет" title="Мои работы" text="Все заказы и действия по ним в одном месте." />
      <div className="orders-list">
        {orders.length === 0 && <div className="trust-note"><h2>Пока пусто</h2><p>Создайте первый мультфильм, и он появится здесь.</p></div>}
        {orders.map((order) => {
          const avatar = order.avatars?.find((item) => item.id === order.selected_avatar_id) || order.avatars?.[0];
          return (
            <article className="order-item" key={order.id}>
              <img src={avatar?.signed_url || order.source_photo_url || "/assets/example-child.png"} alt="" />
              <div><span className="status">{statusLabels[order.status] || order.status}</span><h2>{order.hero_name || "Новый мультфильм"}</h2><p>{order.occasion} · {formatPrice(order.price)}</p><div className="order-actions"><button type="button" onClick={() => { setCurrentOrder(order); setView(order.status === "avatars_ready" ? "avatars" : "payment"); }}>{order.status === "avatars_ready" ? "Выбрать героя" : "Открыть"}</button></div></div>
            </article>
          );
        })}
      </div>
    </>
  );
}

function ExamplesScreen({ category, setCategory, items, setForm, setView }) {
  const categories = ["Все", "Для ребенка", "История любви", "День рождения", "Свадьба"];
  return (
    <>
      <Head kicker="Примеры" title="Готовые мультфильмы" text="Выберите категорию и создайте похожий мультфильм." />
      <div className="category-row">{categories.map((item) => <button className={category === item ? "is-active" : ""} key={item} type="button" onClick={() => setCategory(item)}>{item}</button>)}</div>
      <div className="example-list">{items.map((item) => <article className="example-card" key={item.title}><img src={item.src} alt={item.title} /><div><span>{item.category}</span><h2>{item.title}</h2><button type="button" onClick={() => { setForm((prev) => ({ ...prev, occasion: item.category, price: item.price })); setView("create"); }}>Создать похожий</button></div></article>)}</div>
    </>
  );
}

function GiftScreen({ notify }) {
  const [code, setCode] = useState("");
  return (
    <>
      <Head kicker="Подарок" title="Подарочный сертификат" text="Получатель сам загрузит фото, выберет героя и получит мультфильм." />
      <form className="create-form" onSubmit={(event) => { event.preventDefault(); setCode(`GIFT-${Date.now().toString().slice(-6)}`); notify("Сертификат подготовлен."); }}>
        <div className="certificate-preview panel"><span>Сертификат</span><h2>Один персональный мультфильм</h2><p>Для ребенка · 1 490 ₽</p></div>
        <label className="field"><span>Имя получателя</span><input defaultValue="Маша" /></label>
        <label className="field"><span>Поздравление</span><textarea defaultValue="Пусть эта история станет маленьким семейным чудом." /></label>
        <button className="primary-btn" type="submit">Купить сертификат</button>
      </form>
      {code && <article className="certificate-result panel"><span>Сертификат готов</span><h2>{code}</h2><p>{window.location.origin}/gift/{code}</p></article>}
    </>
  );
}

function ProfileScreen({ user, orders, onLogout }) {
  return (
    <>
      <article className="profile-head panel"><div className="profile-avatar">{(user.email || "Л")[0].toUpperCase()}</div><div><span>Профиль</span><h1>{user.user_metadata?.full_name || "Пользователь"}</h1><p>{user.email}</p></div></article>
      <div className="profile-list"><button type="button">История оплат <span>{orders.length}</span></button><button type="button">Помощь <span>→</span></button><button type="button">Конфиденциальность фото <span>→</span></button><button type="button" onClick={onLogout}>Выйти <span>→</span></button></div>
      <div className="trust-note"><h2>Фото защищены</h2><p>Фото используются только для создания вашего заказа и доступны только вашему аккаунту.</p></div>
    </>
  );
}

function Loader({ title, text }) {
  return <div className="loader-card panel"><div className="magic-loader" /><h1>{title}</h1><p>{text}</p><div className="loader-lines"><span /><span /><span /></div></div>;
}

function Head({ kicker, title, text }) {
  return <div className="compact-head"><span>{kicker}</span><h1>{title}</h1><p>{text}</p></div>;
}

createRoot(document.getElementById("root")).render(<App />);
