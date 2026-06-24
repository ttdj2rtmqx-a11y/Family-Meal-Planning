import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ChefHat,
  ClipboardList,
  ExternalLink,
  Home,
  ListChecks,
  MapPinned,
  Plus,
  RefreshCw,
  ShoppingBasket,
  Tag,
  Utensils,
  X,
} from "lucide-react";
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

const vendorPortals = {
  "Save-On-Foods West Kelowna": {
    checkoutUrl: "https://www.saveonfoods.com/",
    note: "West Kelowna Save-On-Foods entry page",
  },
  "Walmart West Kelowna": {
    checkoutUrl: "https://www.walmart.ca/en/cp/grocery/10019",
    note: "Walmart Canada grocery entry page",
  },
  "Real Canadian Superstore West Kelowna": {
    checkoutUrl: "https://www.pcexpress.ca/",
    note: "PC Express grocery entry page",
  },
  "Costco Kelowna": {
    checkoutUrl: "https://www.costco.ca/grocery-household.html",
    note: "Costco Canada grocery entry page",
  },
  Restock: {
    checkoutUrl: "https://www.saveonfoods.com/",
    note: "West Kelowna restock fallback",
  },
};

const getVendorPortal = (store) =>
  vendorPortals[store] || {
    checkoutUrl: "https://www.saveonfoods.com/",
    note: "West Kelowna grocery entry page",
  };

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

const getMealText = (meal) =>
  normalize([meal.name, meal.why, ...(meal.tags || []), ...(meal.ingredients || []).map((ingredient) => ingredient.item)].join(" "));

const getMealAvoidMatches = (meal, avoidList) =>
  avoidList.filter((item) => item.trim() && getMealText(meal).includes(normalize(item)));

const scoreMeals = (meals, staples, deals, avoidList, mode) =>
  meals
    .map((meal) => {
      const pantryHits = meal.ingredients.filter((ingredient) => findStaple(ingredient.item, staples)).length;
      const dealHits = meal.ingredients.filter((ingredient) => findDeal(ingredient.item, deals)).length;
      const avoidHits = getMealAvoidMatches(meal, avoidList).length;
      const cost = meal.ingredients.reduce((sum, ingredient) => {
        if (findStaple(ingredient.item, staples)) return sum;
        const deal = findDeal(ingredient.item, deals);
        return sum + (deal ? getSelectedOption(deal).salePrice * ingredient.quantity : ingredient.price * ingredient.quantity);
      }, 0);
      const speedBonus = mode === "fastest" ? Math.max(0, 45 - meal.prepMinutes) * 0.8 : 0;
      const costBonus = mode === "lowest cost" ? Math.max(0, 22 - cost) * 1.2 : 0;
      const score = Math.max(0, Math.min(99, meal.matchScore + pantryHits * 3 + dealHits * 4 + speedBonus + costBonus - avoidHits * 35 - Math.max(0, cost - 22)));
      return { ...meal, dynamicCost: cost, score: Math.round(score), avoidHits };
    })
    .sort((a, b) => {
      if (mode === "lowest cost") return a.dynamicCost - b.dynamicCost || b.score - a.score;
      if (mode === "fastest") return a.prepMinutes - b.prepMinutes || a.dynamicCost - b.dynamicCost;
      return b.score - a.score || a.dynamicCost - b.dynamicCost;
    });

const makeSelections = (rankedMeals, avoidList, mode) => {
  const conflictFree = rankedMeals.filter((meal) => !getMealAvoidMatches(meal, avoidList).length);
  const pool = conflictFree.length ? conflictFree : rankedMeals;
  const breadth = mode === "balanced" ? Math.min(pool.length, plan.weeklyPlan.length) : Math.min(pool.length, 2);
  const rotation = pool.slice(0, Math.max(1, breadth));
  return Object.fromEntries(plan.weeklyPlan.map((slot, index) => [slot.day, rotation[index % rotation.length]?.id || rankedMeals[0]?.id]));
};

const parseIngredientLines = (value) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [item, quantity = "1", unit = "item", store = "Save-On-Foods West Kelowna", price = "0"] = line.split(",").map((part) => part.trim());
      return {
        item,
        quantity: Number.parseFloat(quantity) || 1,
        unit,
        store,
        price: Number.parseFloat(price) || 0,
      };
    });

const parseStepLines = (value) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

function App() {
  const [mode, setMode] = useState("balanced");
  const [staples, setStaples] = useState(plan.pantryStaples);
  const [deals, setDeals] = useState(makeDeals(plan.marketDeals));
  const [avoid, setAvoid] = useState(plan.preferences.avoid);
  const [newStaple, setNewStaple] = useState("");
  const [newAvoid, setNewAvoid] = useState("");
  const [status, setStatus] = useState("Checking live brand prices...");
  const [customRecipes, setCustomRecipes] = useState([]);
  const [recipeDraft, setRecipeDraft] = useState({ name: "", prepMinutes: "", cost: "", ingredients: "", steps: "" });
  const [recipeMessage, setRecipeMessage] = useState("");
  const [selectedMeals, setSelectedMeals] = useState(Object.fromEntries(plan.weeklyPlan.map((slot) => [slot.day, slot.mealId])));

  const mealPool = useMemo(() => [...customRecipes, ...plan.mealOptions], [customRecipes]);

  const buildScores = (nextMode = mode, nextAvoid = avoid, nextStaples = staples, nextDeals = deals, nextCustom = customRecipes) =>
    scoreMeals([...nextCustom, ...plan.mealOptions], nextStaples, nextDeals, nextAvoid, nextMode);

  const replan = (nextMode = mode, nextAvoid = avoid, nextStaples = staples, nextDeals = deals, nextCustom = customRecipes) => {
    setSelectedMeals(makeSelections(buildScores(nextMode, nextAvoid, nextStaples, nextDeals, nextCustom), nextAvoid, nextMode));
  };

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

  const mealScores = useMemo(() => scoreMeals(mealPool, staples, deals, avoid, mode), [avoid, deals, mealPool, mode, staples]);

  const selectedMealObjects = plan.weeklyPlan
    .map((slot) => mealScores.find((meal) => meal.id === selectedMeals[slot.day]) || mealScores[0])
    .filter(Boolean);

  const shopping = useMemo(() => {
    const byStore = {};
    const plain = {};
    const covered = [];
    selectedMealObjects.flatMap((meal) => meal.ingredients).forEach((ingredient) => {
      if (findStaple(ingredient.item, staples)) {
        covered.push(ingredient.item);
        return;
      }
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
      plain[plainKey] ||= { item: ingredient.item, brand, unit: ingredient.unit, quantity: 0, price: 0, deal: Boolean(deal) };
      plain[plainKey].quantity += ingredient.quantity;
      plain[plainKey].price += price;
    });
    const stores = Object.fromEntries(Object.entries(byStore).map(([store, items]) => [store, Object.values(items)]));
    const total = Object.values(stores).flat().reduce((sum, item) => sum + item.price, 0);
    return { stores, plain: Object.values(plain), covered, total };
  }, [deals, selectedMealObjects, staples]);

  const avoidIdeas = useMemo(() => {
    const planned = selectedMealObjects.flatMap((meal) => meal.ingredients.map((ingredient) => ingredient.item));
    const market = deals.map((deal) => deal.item);
    const common = ["dairy", "gluten", "eggs", "peanuts", "tree nuts", "pork", "beef", "spicy"];
    return [...new Set([...planned, ...market, ...common])]
      .filter((item) => !avoid.some((avoidItem) => normalize(avoidItem) === normalize(item)))
      .slice(0, 12);
  }, [avoid, deals, selectedMealObjects]);

  const applyMode = (nextMode) => {
    setMode(nextMode);
    replan(nextMode, avoid, staples, deals, customRecipes);
  };

  const addStaple = (event) => {
    event.preventDefault();
    const trimmed = newStaple.trim();
    if (!trimmed) return;
    const nextStaples = staples.some((staple) => textMatches(staple.name, trimmed))
      ? staples.map((staple) => (textMatches(staple.name, trimmed) ? { ...staple, status: "ok", quantity: staple.quantity || "on hand" } : staple))
      : [{ name: trimmed, quantity: "on hand", category: "custom", status: "ok" }, ...staples];
    setStaples(nextStaples);
    setNewStaple("");
    replan(mode, avoid, nextStaples, deals, customRecipes);
  };

  const toggleStaple = (name) => {
    const nextStaples = staples.map((item) => (item.name === name ? { ...item, status: item.status === "low" ? "ok" : "low" } : item));
    setStaples(nextStaples);
    replan(mode, avoid, nextStaples, deals, customRecipes);
  };

  const addAvoidValue = (value) => {
    const trimmed = value.trim();
    if (!trimmed || avoid.some((item) => normalize(item) === normalize(trimmed))) return;
    const nextAvoid = [...avoid, trimmed];
    setAvoid(nextAvoid);
    setNewAvoid("");
    replan(mode, nextAvoid, staples, deals, customRecipes);
  };

  const addAvoid = (event) => {
    event.preventDefault();
    addAvoidValue(newAvoid);
  };

  const removeAvoid = (item) => {
    const nextAvoid = avoid.filter((avoidItem) => avoidItem !== item);
    setAvoid(nextAvoid);
    replan(mode, nextAvoid, staples, deals, customRecipes);
  };

  const updateRecipeDraft = (field, value) => {
    setRecipeDraft((current) => ({ ...current, [field]: value }));
  };

  const addRecipe = (event) => {
    event.preventDefault();
    if (!recipeDraft.name.trim() || !recipeDraft.ingredients.trim()) return;
    const ingredients = parseIngredientLines(recipeDraft.ingredients);
    const estimatedCost = Number.parseFloat(recipeDraft.cost) || ingredients.reduce((sum, ingredient) => sum + ingredient.price * ingredient.quantity, 0);
    const recipe = {
      id: `custom-${Date.now()}`,
      name: recipeDraft.name.trim(),
      type: "custom",
      matchScore: 82,
      dynamicCost: estimatedCost,
      cost: estimatedCost,
      prepMinutes: Number.parseInt(recipeDraft.prepMinutes, 10) || 30,
      why: "Manually entered family recipe. It is now placed into Monday and reflected in the cart and shopping list.",
      tags: ["manual", "family recipe"],
      ingredients,
      steps: parseStepLines(recipeDraft.steps).length ? parseStepLines(recipeDraft.steps) : ["Prep ingredients.", "Cook using your family method.", "Serve and save notes for next time."],
    };
    const nextCustom = [recipe, ...customRecipes];
    setCustomRecipes(nextCustom);
    setSelectedMeals((current) => ({ ...current, [plan.weeklyPlan[0].day]: recipe.id }));
    setRecipeDraft({ name: "", prepMinutes: "", cost: "", ingredients: "", steps: "" });
    setRecipeMessage(`${recipe.name} was added to Monday and the shopping list was updated.`);
  };

  return (
    <main>
      <header className="topbar">
        <div className="brand"><ShoppingBasket /><div><strong>Family Shopping Optimizer</strong><span>West Kelowna + Costco Kelowna meal and grocery planning</span></div></div>
        <div className="mode-switch">{["lowest cost", "balanced", "fastest"].map((option) => <button className={mode === option ? "active" : ""} onClick={() => applyMode(option)} key={option}>{option}</button>)}</div>
      </header>

      <section className="hero">
        <div><span className="eyebrow">{mode}</span><h1>Plan meals from what you have, what you want, and what is actually on deal.</h1><p>Brand choices, pantry changes, avoid foods, manual recipes, and meal swaps recalculate the vendor carts and store-independent shopping list.</p></div>
        <div className="hero-stats"><strong>{money(shopping.total)}</strong><span>projected meal-plan basket</span><strong>{money(plan.family.weeklyBudget - shopping.total)}</strong><span>left in weekly target</span></div>
      </section>

      <section className="grid">
        <section className="panel"><h2><Home /> House staples</h2><form onSubmit={addStaple} className="inline-form"><input value={newStaple} onChange={(e) => setNewStaple(e.target.value)} placeholder="Add staple" aria-label="Add staple" /><button type="submit"><Plus size={16} /> Add</button></form><div className="chips">{staples.map((staple) => <button key={staple.name} className={staple.status === "low" ? "warn" : ""} onClick={() => toggleStaple(staple.name)}>{staple.name}<span>{staple.status}</span></button>)}</div></section>

        <section className="panel"><h2><Tag /> Deal signals</h2><p className="note">{status}</p><button className="refresh" onClick={refreshPrices}><RefreshCw size={16} /> Refresh prices</button><div className="cards">{deals.map((deal) => { const selected = getSelectedOption(deal); return <article className="deal" key={`${deal.store}-${deal.item}`}><div><strong>{deal.item}</strong><span>{deal.store} · through {deal.expires}</span><select value={deal.selectedBrand} aria-label={`${deal.item} brand`} onChange={(e) => setDeals((current) => current.map((item) => item.item === deal.item && item.store === deal.store ? { ...item, selectedBrand: e.target.value } : item))}>{getBrandOptions(deal).map((option) => <option key={option.brand} value={option.brand}>{option.brand} · {money(option.salePrice)}</option>)}</select><em>{selected.availability || "Unknown"}</em></div><strong>{money(selected.salePrice)}</strong></article>; })}</div></section>

        <section className="panel"><h2><X /> Foods to avoid</h2><form onSubmit={addAvoid} className="inline-form"><input value={newAvoid} onChange={(e) => setNewAvoid(e.target.value)} placeholder="Add avoid" aria-label="Add avoid" /><button type="submit"><Plus size={16} /> Add</button></form><div className="quick-chip-grid">{avoidIdeas.map((item) => <button key={item} type="button" onClick={() => addAvoidValue(item)}>{item}</button>)}</div><div className="chips danger">{avoid.map((item) => <button key={item} onClick={() => removeAvoid(item)}>{item}<X size={14} /></button>)}</div></section>

        <section className="panel wide"><h2><ChefHat /> 7-day meal plan</h2><div className="meal-grid">{plan.weeklyPlan.map((slot) => { const meal = mealScores.find((item) => item.id === selectedMeals[slot.day]) || mealScores[0]; const conflicts = getMealAvoidMatches(meal, avoid); return <article className={`meal ${conflicts.length ? "has-conflict" : ""}`} key={slot.day}><span>{slot.day}</span><select value={meal.id} aria-label={`${slot.day} meal`} onChange={(e) => setSelectedMeals((current) => ({ ...current, [slot.day]: e.target.value }))}>{mealScores.map((option) => <option key={option.id} value={option.id}>{option.name} · {option.score}% · {money(option.dynamicCost)}</option>)}</select><p>{meal.why}</p>{conflicts.length > 0 && <small className="conflict-note">Avoid conflict: {conflicts.join(", ")}</small>}<details><summary>Recipe</summary><div className="recipe-columns"><div><strong>Ingredients</strong><ul>{meal.ingredients.map((ingredient) => <li key={`${meal.id}-${ingredient.item}`}>{formatQty(ingredient.quantity)} {ingredient.unit} {ingredient.item}</li>)}</ul></div><div><strong>Steps</strong><ol>{meal.steps.map((step) => <li key={step}>{step}</li>)}</ol></div></div></details></article>; })}</div></section>

        <section className="panel wide"><h2><ClipboardList /> Manual recipe input</h2><form className="recipe-form" onSubmit={addRecipe}><div className="form-row"><input aria-label="Recipe name" placeholder="Recipe name" value={recipeDraft.name} onChange={(e) => updateRecipeDraft("name", e.target.value)} /><input aria-label="Prep minutes" placeholder="Minutes" inputMode="numeric" value={recipeDraft.prepMinutes} onChange={(e) => updateRecipeDraft("prepMinutes", e.target.value)} /><input aria-label="Estimated recipe cost" placeholder="Cost" inputMode="decimal" value={recipeDraft.cost} onChange={(e) => updateRecipeDraft("cost", e.target.value)} /></div><textarea aria-label="Recipe ingredients" placeholder={"Ingredients, one per line:\nChicken thighs, 2, lb, Costco Kelowna, 4.58\nRice, 1, lb, Home, 0"} value={recipeDraft.ingredients} onChange={(e) => updateRecipeDraft("ingredients", e.target.value)} /><textarea aria-label="Recipe steps" placeholder={"Steps, one per line:\nCook rice.\nSeason and roast chicken.\nServe with vegetables."} value={recipeDraft.steps} onChange={(e) => updateRecipeDraft("steps", e.target.value)} /><button type="submit"><Plus size={16} /> Add recipe</button></form>{recipeMessage && <p className="recipe-message">{recipeMessage}</p>}</section>

        <section className="panel wide"><h2><ShoppingBasket /> Online cart builder</h2><p className="shopping-note">Built from the active meal plan and pantry. Open vendor entry pages to finish checkout; no blocked deep-search links.</p><div className="store-grid">{Object.entries(shopping.stores).map(([store, items]) => { const portal = getVendorPortal(store); const total = items.reduce((sum, item) => sum + item.price, 0); return <article className="store" key={store}><div className="store-top"><div><strong>{store}</strong><small>{portal.note}</small></div><b>{money(total)}</b></div>{items.map((item) => <div className="line" key={`${store}-${item.item}-${item.brand}`}><span>{item.item}<small>{item.brand} · {formatQty(item.quantity)} {item.unit}</small></span><b>{money(item.price)}</b></div>)}<a className="store-link" href={portal.checkoutUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Open store</a></article>; })}</div></section>

        <section className="panel wide independent-list"><h2><ListChecks /> Store-independent shopping list</h2><p className="shopping-note">Independent of where it is purchased. This list reflects the selected meals, servings, active brand prices, avoid foods, and what you already have.</p><div className="plain-list">{shopping.plain.map((item) => <div className="line" key={`${item.item}-${item.brand}`}><span>{item.item}<small>{item.brand} · {formatQty(item.quantity)} {item.unit}{item.deal ? " · deal available" : ""}</small></span><b>{money(item.price)}</b></div>)}</div>{shopping.covered.length > 0 && <div className="covered"><strong>Already covered at home</strong><span>{[...new Set(shopping.covered)].join(", ")}</span></div>}</section>

        <section className="panel"><h2><Utensils /> Recipe ideas</h2>{plan.externalRecipeSuggestions.map((recipe) => <a className="recipe" href={recipe.sourceUrl} target="_blank" rel="noreferrer" key={recipe.id}><img src={recipe.imageUrl} alt="" /><span>{recipe.name}<small>{recipe.marketTieIn}</small></span></a>)}</section>

        <section className="panel"><h2><MapPinned /> Vendor route</h2><svg viewBox="0 0 100 70" className="map"><polyline points="10,58 32,45 50,36 64,52 84,20" /><circle cx="10" cy="58" r="4" /><circle cx="32" cy="45" r="4" /><circle cx="50" cy="36" r="4" /><circle cx="64" cy="52" r="4" /><circle cx="84" cy="20" r="4" /></svg>{plan.stores.map((store) => <div className="line" key={store.name}><span>{store.name}<small>{store.bestFor.join(", ")}</small></span><b>{store.timeMinutes} min</b></div>)}</section>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
