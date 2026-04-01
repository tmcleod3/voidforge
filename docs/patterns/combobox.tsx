/**
 * Pattern: Accessible Combobox with Value Source Management
 *
 * Key principles:
 * - Two distinct value sources: display value (closed) and search query (open)
 * - Never let dropdown close events switch the value source mid-keystroke
 * - ARIA combobox role with listbox, proper focus management
 * - Keyboard nav: arrow keys, Enter to select, Escape to close
 *
 * The trap: A controlled combobox shows `displayValue` when closed and
 * `searchQuery` when open. If the search function closes the dropdown
 * (e.g., on short queries or no results), the input switches from
 * `searchQuery` back to `displayValue` — wiping the user's keystrokes.
 *
 * Agents: Legolas (code), Samwise (a11y), Bilbo (copy)
 *
 * Framework adaptations:
 *   React: This file (hooks, controlled input)
 *   Vue: v-model with computed get/set for value source switching
 *   Svelte: Reactive declarations with $: for value derivation
 *   Django + HTMX: Server-filtered results via hx-get, debounced hx-trigger
 *
 * Field report #259: Combobox value source switching caused keystroke loss
 * when dropdown closed during typing.
 */

import { useState, useRef, useCallback, useEffect } from 'react';

// ── Types ────────────────────────────────────────────────

interface ComboboxOption {
  id: string;
  label: string;          // Display text
  searchText?: string;    // Optional: separate text for search matching
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string | null;           // Selected option ID
  onChange: (id: string | null) => void;
  onSearch?: (query: string) => void;  // For async/server-side search
  placeholder?: string;
  label: string;                  // Required — a11y
  disabled?: boolean;
  minSearchLength?: number;       // Min chars before showing results (default: 1)
}

// ── The Value Source Rule ────────────────────────────────
//
// WRONG: Derive input value from isOpen
//   value={isOpen ? searchQuery : displayValue}
//   // Closing the dropdown wipes searchQuery with displayValue
//
// RIGHT: Track value source explicitly, only switch on user actions
//   - User types → source = 'search'
//   - User selects option → source = 'display', close dropdown
//   - User clicks away (blur) → source = 'display', close dropdown
//   - User presses Escape → source = 'display', close dropdown
//   - Dropdown closes from search logic → DO NOT switch source
//
// The key insight: the dropdown's open/closed state should NOT
// control the input's value source. Only explicit user intent should.

type ValueSource = 'search' | 'display';

export function Combobox({
  options,
  value,
  onChange,
  onSearch,
  placeholder = 'Search...',
  label,
  disabled = false,
  minSearchLength = 1,
}: ComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [valueSource, setValueSource] = useState<ValueSource>('display');
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const listboxId = useRef(`combobox-listbox-${Math.random().toString(36).slice(2)}`);

  // Derive display value from selected option
  const selectedOption = options.find(o => o.id === value);
  const displayValue = selectedOption?.label ?? '';

  // The input shows search query OR display value based on explicit source
  const inputValue = valueSource === 'search' ? searchQuery : displayValue;

  // Filter options locally (skip if onSearch handles it server-side)
  const filteredOptions = onSearch
    ? options  // Server-side search — show whatever options are provided
    : options.filter(o => {
        if (searchQuery.length < minSearchLength) return false;
        const text = o.searchText ?? o.label;
        return text.toLowerCase().includes(searchQuery.toLowerCase());
      });

  // ── User types → switch to search source, open dropdown ──
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    setValueSource('search');  // Explicit: user is searching
    setActiveIndex(-1);

    if (query.length >= minSearchLength) {
      setIsOpen(true);
      onSearch?.(query);
    }
    // NOTE: Do NOT close the dropdown here even if query is short.
    // Closing here would switch value source and wipe keystrokes.
    // Let the empty results state handle "no results" display.
  }, [minSearchLength, onSearch]);

  // ── User selects → switch to display source, close ──
  const handleSelect = useCallback((optionId: string) => {
    onChange(optionId);
    setValueSource('display');  // Explicit: user made a selection
    setIsOpen(false);
    setSearchQuery('');
    setActiveIndex(-1);
    inputRef.current?.focus();
  }, [onChange]);

  // ── User blurs → switch to display source, close ──
  const handleBlur = useCallback((e: React.FocusEvent) => {
    // Don't close if focus moved to the listbox
    if (listboxRef.current?.contains(e.relatedTarget as Node)) return;
    setValueSource('display');
    setIsOpen(false);
    setSearchQuery('');
    setActiveIndex(-1);
  }, []);

  // ── Keyboard navigation ──
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          setActiveIndex(0);
        } else {
          setActiveIndex(i => Math.min(i + 1, filteredOptions.length - 1));
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (isOpen && activeIndex >= 0 && filteredOptions[activeIndex]) {
          handleSelect(filteredOptions[activeIndex].id);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setValueSource('display');  // Explicit: user cancelled
        setIsOpen(false);
        setSearchQuery('');
        setActiveIndex(-1);
        break;
      case 'Home':
        if (isOpen) { e.preventDefault(); setActiveIndex(0); }
        break;
      case 'End':
        if (isOpen) { e.preventDefault(); setActiveIndex(filteredOptions.length - 1); }
        break;
    }
  }, [isOpen, activeIndex, filteredOptions, handleSelect]);

  // Scroll active option into view
  useEffect(() => {
    if (activeIndex >= 0 && listboxRef.current) {
      const activeEl = listboxRef.current.children[activeIndex] as HTMLElement;
      activeEl?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const activeDescendant = activeIndex >= 0
    ? `${listboxId.current}-option-${activeIndex}`
    : undefined;

  return (
    <div className="relative" onBlur={handleBlur}>
      <label id={`${listboxId.current}-label`} className="block text-sm font-medium">
        {label}
      </label>
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId.current}
        aria-labelledby={`${listboxId.current}-label`}
        aria-activedescendant={activeDescendant}
        aria-autocomplete="list"
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (displayValue) {
            // Pre-fill search with current value so user can refine
            setSearchQuery(displayValue);
            setValueSource('search');
            setIsOpen(true);
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full border rounded px-3 py-2 focus-visible:ring-2 focus-visible:ring-blue-500"
      />
      {isOpen && (
        <ul
          ref={listboxRef}
          id={listboxId.current}
          role="listbox"
          aria-labelledby={`${listboxId.current}-label`}
          className="absolute z-10 w-full mt-1 bg-white border rounded shadow-lg max-h-60 overflow-auto"
        >
          {filteredOptions.length === 0 ? (
            <li className="px-3 py-2 text-gray-500" role="option" aria-selected={false}>
              No results found
            </li>
          ) : (
            filteredOptions.map((option, index) => (
              <li
                key={option.id}
                id={`${listboxId.current}-option-${index}`}
                role="option"
                aria-selected={option.id === value}
                className={`px-3 py-2 cursor-pointer ${
                  index === activeIndex ? 'bg-blue-100' : ''
                } ${option.id === value ? 'font-semibold' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent blur before select
                  handleSelect(option.id);
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                {option.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

// ── Server-Side Search Example (async) ──────────────────
//
// function CityCombobox() {
//   const [cities, setCities] = useState<ComboboxOption[]>([]);
//   const [selected, setSelected] = useState<string | null>(null);
//
//   const handleSearch = useCallback(async (query: string) => {
//     const results = await fetch(`/api/cities?q=${encodeURIComponent(query)}`);
//     const data = await results.json();
//     setCities(data.map((c: any) => ({ id: c.id, label: c.displayName })));
//   }, []);
//
//   return (
//     <Combobox
//       options={cities}
//       value={selected}
//       onChange={setSelected}
//       onSearch={handleSearch}
//       label="City"
//       placeholder="Search cities..."
//       minSearchLength={2}
//     />
//   );
// }
//
// ── Django + HTMX Adaptation ────────────────────────────
//
// Server-filtered combobox without client-side JS framework:
//
//   <input
//     type="text"
//     name="city"
//     hx-get="/api/cities/"
//     hx-trigger="input changed delay:300ms"
//     hx-target="#city-results"
//     hx-swap="innerHTML"
//     role="combobox"
//     aria-expanded="false"
//     aria-controls="city-results"
//     autocomplete="off"
//   />
//   <ul id="city-results" role="listbox"></ul>
//
// Server returns <li role="option"> fragments. Client-side JS
// (minimal, not a framework) handles: aria-expanded toggle,
// aria-activedescendant on arrow keys, selection on Enter.
// The value source trap still applies — use a hidden input for
// the selected ID and keep the visible input for display/search.
