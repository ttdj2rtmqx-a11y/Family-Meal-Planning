import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ChefHat, Home, ListChecks, MapPinned, Plus, RefreshCw, ShoppingBasket, Tag, Utensils, X } from "lucide-react";
import plan from "../data/sample-shopping-plan.json";
import "./styles.css";

const money = (value) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: plan.family.currency,
    maximumFractionDigits: 2,
  }).format(value || 0);

const normalize = (value = "") => value.toString().toLowerCase().trim();
const textMatches = (a, b) => normalize(a).includes(normalize(b)) || normalize(b).includes(normalize(a));
const formatQty = (value) => (Number.isInteger(value) ? value : Math.round(value * 10) / 10);

const getBrandOptions = (deal) =>
  (deal.brandOptions?.length ? deal.brandOptions : [{ brand: deal.brand, salePrice: deal.salePrice, normalPrice: deal.normalPrice }]).map((option) => ({
    availability: "Unknown",
    salePrice: deal.salePrice,
    normalPrice: deal.normalPrice,
    ...option,
  }));

const getSelectedOption = (deal) => {
  const options = getBrandOptions(deal);
  return options.find((option) => option.brand === (deal.selectedBrand || deal.brand)) || options[0];
};

const makeDeals = (deals) =>
  deals.map((deal) => ({
    ...deal,
    active: true,
    selectedBrand: deal.brand || getBrandOptions(deal)[0]?.brand,
  }));

const mergePriceFeed = (deals, feed) =>
  deals.map((deal) => {
    const update = feed.deals?.find((candidate) => candidate.store === deal.store && textMatches(candidate.item, deal.item));
    if (!update) return deal;
    const brandOptions = getBrandOptions({ ...deal, ...update, brandOptions: update.brandOptions || deal.brandOptions }).map((option) => ({
      ...option,
      source: feed.source || "Live price feed",
      updatedAt: feed.updatedAt,
    }));
    const selectedBrand = brandOptions.some((option) => option.brand === deal.selectedBrand) ? deal.selectedBrand : brandOptions[0]?.brand;
    return { ...deal, ...update, brandOptions, selectedBrand, liveSource: feed.source, liveUpdatedAt: feed.updatedAt };
  });

const findDeal = (item, deals) => deals.find((deal) => deal.active !== false && textMatches(deal.item, item));
const findStaple = (item, staples) => staples.find((staple) => staple.status !== "low" && textMatches(staple.name, item));

function App() {
  const [mode, setMode] = useState("balanced");
  const [staples, setStaples] = useState(plan.pantryStaples);
  const [deals, setDeals] = useState(makeDeals(plan.marketDeals));
  const [avoid, setAvoid] = useState(plan.preferences.avoid);
  const [newStaple, setNewStaple] = useState("");
  const [newAvoid, setNewAvoid] = useState("");
  const [status, setStatus] = useState("Checking live brand prices...");
  const [selectedMeals, setSelectedMeals] = useState(Object.fromEntries(plan.weeklyPlan.map((slot) => [slot.day, slot.mealId])));

  const refreshPrices = async () => {
    setStatus("Refreshing brand prices...");
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}price-feed.json?ts=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("price feed unavailable");
      const feed = await response.json();
      setDeals((current) => mergePriceFeed(current, feed));
      setStatus(`Live prices loaded: ${feed.source || "price feed"}`);
    } catch {
      setStatus("Using built-in prices until the daily vendor feed is available.");
    }
  };

  useEffect(() => {
    refreshPrices();
  }, []);

  const mealScores = useMemo(() => {
    return plan.mealOptions.map((meal) => {
      const text = normalize([meal.name, meal.why, ...(meal.tags || []), ...meal.ingredients.map((i) => i.item)].join(" "));
      const pantryHits = meal.ingredients.filter((ingredient) => findStaple(ingredient.item, staples)).length;
      const dealHits = meal.ingredients.filter((ingredient) => findDeal(ingredient.item, deals)).length;
      const avoidHits = avoid.filter((item) => text.includes(normalize(item))).length;
      const cost = meal.ingredients.reduce((sum, ingredient) => {
        if (findStaple(ingredient.item, staples)) return sum;
        const deal = findDeal(ingredient.item, deals);
        return sum + (deal ? getSelectedOption(deal).salePrice * ingredient.quantity : ingredient.price);
      }, 0);
      const score = Math.max(0, Math.min(99, meal.matchScore + pantryHits * 3 + dealHits * 4 - avoidHits * 30 - Math.max(0, cost - 20)));
      return { ...meal, dynamicCost: cost, score: Math.round(score) };
    }).sort((a, b) => {
      if (mode === "lowest cost") return a.dynamicCost - b.dynamicCost;
      if (mode === "fastest") return a.prepMinutes - b.prepMinutes;
      return b.score - a.score;
    });
  }, [avoid, deals, mode, staples]);

  const selectedMealObjects = plan.weeklyPlan.map((slot) => mealScores.find((meal) => meal.id === selectedMeals[slot.day])).filter(Boolean);

  const shopping = useMemo(() => {
    const byStore = {};
    const plain = {};
    selectedMealObjects.flatMap((meal) => meal.ingredients).forEach((ingredient) => {
      if (findStaple(ingredient.item, staples)) return;
      const deal = findDeal(ingredient.item, deals);
      const option = deal ? getSelectedOption(deal) : null;
      const store = deal?.store || ingredient.store || "Restock";
      const brand = option?.brand || ingredient.brand || "best available";
      const price = (option?.salePrice ?? ingredient.price) * ingredient.quantity;
      const key = `${store}-${ingredient.item}-${brand}`;
      byStore[store] ||= {};
      byStore[store][key] ||= { item: ingredient.item, brand, unit: ingredient.unit, quantity: 0, price: 0, deal: Boolean(deal) };
      byStore[store][key].quantity += ingredient.quantity;
      byStore[store][key].price += price;
      const plainKey = `${ingredient.item}-${brand}-${ingredient.unit}`;
      plain[plainKey] ||= { item: ingredient.item, brand, unit: ingredient.unit, quantity: 0, price: 0 };
      plain[plainKey].quantity += ingredient.quantity;
      plain[plainKey].price += price;
    });
    const stores = Object.fromEntries(Object.entries(byStore).map(([store, items]) => [store, Object.values(items)]));
    const total = Object.values(stores).flat().reduce((sum, item) => sum + item.price, 0);
    return { stores, plain: Object.values(plain), total };
  }, [deals, selectedMealObjects, staples]);

  const addStaple = (event) => {
    event.preventDefault();
    if (!newStaple.trim()) return;
    setStaples((current) => [{ name: newStaple.trim(), quantity: "on hand", category: "custom", status: "ok" }, ...current]);
    setNewStaple("");
  };

  const addAvoid = (event) => {
    event.preventDefault();
    if (!newAvoid.trim()) return;
    setAvoid((current) => [...new Set([...current, newAvoid.trim()])]);
    setNewAvoid("");
  };

  return (
    <main>
      <header className="topbar">
        <div className="brand"><ShoppingBasket /><div><strong>Family Shopping Optimizer</strong><span>West Kelowna + Costco Kelowna meal and grocery planning</span></div></div>
        <div className="mode-switch">{["lowest cost", "balanced", "fastest"].map((option) => <button className={mode === option ? "active" : ""} onClick={() => setMode(option)} key={option}>{option}</button>)}</div>
      </header>

      <section className="hero">
        <div><span className="eyebrow">{mode}</span><h1>Plan meals from what you have, what you want, and what is actually on deal.</h1><p>Brand choices in Deal Signals recalculate the meal plan, vendor carts, and store-independent shopping list.</p></div>
        <div className="hero-stats"><strong>{money(shopping.total)}</strong><span>projected meal-plan basket</span><strong>{money(plan.family.weeklyBudget - shopping.total)}</strong><span>left in weekly target</span></div>
      </section>

      <section className="grid">
        <section className="panel"><h2><Home /> House staples</h2><form onSubmit={addStaple} className="inline-form"><input value={newStaple} onChange={(e) => setNewStaple(e.target.value)} placeholder="Add staple" /><button><Plus size={16} /> Add</button></form><div className="chips">{staples.map((staple) => <button key={staple.name} className={staple.status === "low" ? "warn" : ""} onClick={() => setStaples((current) => current.map((item) => item.name === staple.name ? { ...item, status: item.status === "low" ? "ok" : "low" } : item))}>{staple.name}<span>{staple.status}</span></button>)}</div></section>

        <section className="panel"><h2><Tag /> Deal signals</h2><p className="note">{status}</p><button className="refresh" onClick={refreshPrices}><RefreshCw size={16} /> Refresh prices</button><div className="cards">{deals.map((deal) => { const selected = getSelectedOption(deal); return <article className="deal" key={`${deal.store}-${deal.item}`}><div><strong>{deal.item}</strong><span>{deal.store} · through {deal.expires}</span><select value={deal.selectedBrand} onChange={(e) => setDeals((current) => current.map((item) => item.item === deal.item && item.store === deal.store ? { ...item, selectedBrand: e.target.value } : item))}>{getBrandOptions(deal).map((option) => <option key={option.brand} value={option.brand}>{option.brand} · {money(option.salePrice)}</option>)}</select><em>{selected.availability || "Unknown"}</em></div><strong>{money(selected.salePrice)}</strong></article>; })}</div></section>

        <section className="panel"><h2><X /> Foods to avoid</h2><form onSubmit={addAvoid} className="inline-form"><input value={newAvoid} onChange={(e) => setNewAvoid(e.target.value)} placeholder="Add avoid" /><button><Plus size={16} /> Add</button></form><div className="chips danger">{avoid.map((item) => <button key={item} onClick={() => setAvoid((current) => current.filter((avoidItem) => avoidItem !== item))}>{item}<X size={14} /></button>)}</div></section>

        <section className="panel wide"><h2><ChefHat /> 7-day meal plan</h2><div className="meal-grid">{plan.weeklyPlan.map((slot) => { const meal = mealScores.find((item) => item.id === selectedMeals[slot.day]) || mealScores[0]; return <article className="meal" key={slot.day}><span>{slot.day}</span><select value={meal.id} onChange={(e) => setSelectedMeals((current) => ({ ...current, [slot.day]: e.target.value }))}>{mealScores.map((option) => <option key={option.id} value={option.id}>{option.name} · {option.score}% · {money(option.dynamicCost)}</option>)}</select><p>{meal.why}</p><details><summary>Recipe</summary><ol>{meal.steps.map((step) => <li key={step}>{step}</li>)}</ol></details></article>; })}</div></section>

        <section className="panel wide"><h2><ShoppingBasket /> Online cart builder</h2><div className="store-grid">{Object.entries(shopping.stores).map(([store, items]) => <article className="store" key={store}><strong>{store}</strong>{items.map((item) => <div className="line" key={`${store}-${item.item}-${item.brand}`}><span>{item.item}<small>{item.brand} · {formatQty(item.quantity)} {item.unit}</small></span><b>{money(item.price)}</b></div>)}</article>)}</div></section>

        <section className="panel wide"><h2><ListChecks /> Shopping list</h2><div className="plain-list">{shopping.plain.map((item) => <div className="line" key={`${item.item}-${item.brand}`}><span>{item.item}<small>{item.brand} · {formatQty(item.quantity)} {item.unit}</small></span><b>{money(item.price)}</b></div>)}</div></section>

        <section className="panel"><h2><Utensils /> Recipe ideas</h2>{plan.externalRecipeSuggestions.map((recipe) => <a className="recipe" href={recipe.sourceUrl} target="_blank" rel="noreferrer" key={recipe.id}><img src={recipe.imageUrl} alt="" /><span>{recipe.name}<small>{recipe.marketTieIn}</small></span></a>)}</section>

        <section className="panel"><h2><MapPinned /> Vendor route</h2><svg viewBox="0 0 100 70" className="map"><polyline points="10,58 32,45 50,36 64,52 84,20" /><circle cx="10" cy="58" r="4" /><circle cx="32" cy="45" r="4" /><circle cx="50" cy="36" r="4" /><circle cx="64" cy="52" r="4" /><circle cx="84" cy="20" r="4" /></svg>{plan.stores.map((store) => <div className="line" key={store.name}><span>{store.name}<small>{store.bestFor.join(", ")}</small></span><b>{store.timeMinutes} min</b></div>)}</section>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
