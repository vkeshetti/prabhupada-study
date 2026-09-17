import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import './App.css';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export default function App() {
  const [books, setBooks] = useState([]);
  const [entries, setEntries] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [activeTab, setActiveTab] = useState('entries'); // 'entries' | 'add' | 'revision' | 'regex-help'

  // Edit State
  const [editingEntryId, setEditingEntryId] = useState(null);

  // Form State
  const [selectedBookId, setSelectedBookId] = useState('');
  const [canto, setCanto] = useState('');
  const [chapter, setChapter] = useState('');
  const [verse, setVerse] = useState('');
  const [passageType, setPassageType] = useState('Paragraph');
  const [selectedPassage, setSelectedPassage] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState([]);
  const [reflection, setReflection] = useState('');
  const [actionPoint, setActionPoint] = useState('');
  const [question, setQuestion] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [isRegexMode, setIsRegexMode] = useState(false);
  const [regexError, setRegexError] = useState('');
  const [filterBookId, setFilterBookId] = useState('ALL');
  const [filterType, setFilterType] = useState('ALL');
  const [filterTag, setFilterTag] = useState('');
  const [filterFavoritesOnly, setFilterFavoritesOnly] = useState(false);

  // Selective Export Selection State
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Revision State
  const [randomEntry, setRandomEntry] = useState(null);

  useEffect(() => {
    fetchBooks();
    fetchEntries();
    fetchTags();
  }, []);

  async function fetchBooks() {
    const { data } = await supabase.from('books').select('*').order('title');
    if (data && data.length > 0) {
      setBooks(data);
      if (!selectedBookId) setSelectedBookId(data[0].id);
    }
  }

  async function fetchTags() {
    const { data } = await supabase.from('tags').select('name').order('name');
    if (data) setAllTags(data.map((t) => t.name));
  }

  async function fetchEntries() {
    const { data } = await supabase
      .from('study_entries')
      .select('*, books(title), entry_tags(tags(name))')
      .order('created_at', { ascending: false });
    if (data) setEntries(data);
  }

  function handleTagInputChange(value) {
    setTagsInput(value);
    const tokens = value.split(/[,\s]+/);
    const currentToken = tokens[tokens.length - 1].replace(/^#/, '').toLowerCase();

    if (currentToken.length > 0) {
      const matches = allTags.filter((t) =>
        t.toLowerCase().includes(currentToken)
      );
      setTagSuggestions(matches.slice(0, 5));
    } else {
      setTagSuggestions([]);
    }
  }

  function applyTagSuggestion(tag) {
    const tokens = tagsInput.trim().split(/[,\s]+/);
    tokens[tokens.length - 1] = `#${tag}`;
    setTagsInput(tokens.join(' ') + ' ');
    setTagSuggestions([]);
  }

  const selectedBook = books.find((b) => b.id === selectedBookId);

  function resetForm() {
    setSelectedPassage('');
    setReflection('');
    setActionPoint('');
    setQuestion('');
    setTagsInput('');
    setCanto('');
    setChapter('');
    setVerse('');
    setPassageType('Paragraph');
    setEditingEntryId(null);
  }

  function startEditing(entry) {
    setEditingEntryId(entry.id);
    setSelectedBookId(entry.book_id);
    setCanto(entry.canto_or_part || '');
    setChapter(entry.chapter || '');
    setVerse(entry.verse_or_section || '');
    setPassageType(entry.passage_type || 'Paragraph');
    setSelectedPassage(entry.selected_passage || '');
    setReflection(entry.reflection || '');
    setActionPoint(entry.action_point || '');
    setQuestion(entry.question || '');

    const tags = entry.entry_tags?.map((t) => `#${t.tags?.name}`).join(' ') || '';
    setTagsInput(tags);

    setActiveTab('add');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleDeleteEntry(id) {
    if (!window.confirm('Are you sure you want to delete this study entry? This cannot be undone.')) {
      return;
    }

    const { error } = await supabase.from('study_entries').delete().eq('id', id);
    if (error) {
      alert('Failed to delete entry: ' + error.message);
    } else {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (randomEntry?.id === id) setRandomEntry(null);
    }
  }

  async function handleSaveEntry(e) {
    e.preventDefault();
    if (!selectedPassage.trim()) return alert('Please enter a passage.');
    setIsSaving(true);

    try {
      let currentEntryId = editingEntryId;

      const payload = {
        book_id: selectedBookId,
        canto_or_part: selectedBook?.has_cantos ? canto : null,
        chapter: chapter || null,
        verse_or_section: verse || null,
        passage_type: passageType,
        selected_passage: selectedPassage,
        reflection: reflection || null,
        action_point: actionPoint || null,
        question: question || null,
        updated_at: new Date().toISOString(),
      };

      if (editingEntryId) {
        const { error: updateError } = await supabase
          .from('study_entries')
          .update(payload)
          .eq('id', editingEntryId);
        if (updateError) throw updateError;

        // Clear existing entry_tags to rebuild tags cleanly
        await supabase.from('entry_tags').delete().eq('entry_id', editingEntryId);
      } else {
        const { data: entryData, error: insertError } = await supabase
          .from('study_entries')
          .insert(payload)
          .select()
          .single();
        if (insertError) throw insertError;
        currentEntryId = entryData.id;
      }

      // Process and attach tags
      const rawTags = tagsInput
        .split(/[,\s]+/)
        .map((t) => t.replace(/^#/, '').trim().toLowerCase())
        .filter((t) => t.length > 0);

      const uniqueTags = [...new Set(rawTags)];

      for (const tagName of uniqueTags) {
        let { data: tagData } = await supabase
          .from('tags')
          .select('id')
          .eq('name', tagName)
          .maybeSingle();

        if (!tagData) {
          const { data: newTag } = await supabase
            .from('tags')
            .insert({ name: tagName })
            .select()
            .single();
          tagData = newTag;
        }

        if (tagData) {
          await supabase
            .from('entry_tags')
            .insert({ entry_id: currentEntryId, tag_id: tagData.id });
        }
      }

      resetForm();
      await fetchEntries();
      await fetchTags();
      setActiveTab('entries');
    } catch (err) {
      alert('Error saving entry: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleFavorite(entry) {
    const newStatus = !entry.is_favorite;
    setEntries((prev) =>
      prev.map((item) =>
        item.id === entry.id ? { ...item, is_favorite: newStatus } : item
      )
    );

    if (randomEntry && randomEntry.id === entry.id) {
      setRandomEntry({ ...randomEntry, is_favorite: newStatus });
    }

    const { error } = await supabase
      .from('study_entries')
      .update({ is_favorite: newStatus })
      .eq('id', entry.id);

    if (error) {
      alert('Failed to update favorite status');
      fetchEntries();
    }
  }

  function pickRandomEntry(favoritesOnly = false) {
    let pool = entries;
    if (favoritesOnly) {
      pool = entries.filter((e) => e.is_favorite);
    }
    if (pool.length === 0) {
      alert(favoritesOnly ? 'No favorite entries saved yet.' : 'No entries found.');
      return;
    }
    const randomIndex = Math.floor(Math.random() * pool.length);
    setRandomEntry(pool[randomIndex]);
  }

  // Filter & Search Engine
  const filteredEntries = useMemo(() => {
    setRegexError('');
    let compiledRegex = null;

    if (isRegexMode && searchQuery.trim()) {
      try {
        compiledRegex = new RegExp(searchQuery, 'i');
      } catch (err) {
        setRegexError('Invalid regex: ' + err.message);
        return [];
      }
    }

    const rawQuery = searchQuery.trim().toLowerCase();
    const normalizedQuery = rawQuery.startsWith('#') ? rawQuery.slice(1) : rawQuery;

    return entries.filter((item) => {
      if (filterFavoritesOnly && !item.is_favorite) return false;
      if (filterBookId !== 'ALL' && item.book_id !== filterBookId) return false;
      if (filterType !== 'ALL' && item.passage_type !== filterType) return false;

      const itemTags = item.entry_tags?.map((t) => t.tags?.name?.toLowerCase()) || [];
      if (filterTag && !itemTags.includes(filterTag.toLowerCase())) return false;

      if (!searchQuery.trim()) return true;

      const tagsSearchString = itemTags.map((t) => `#${t} ${t}`).join(' ');
      const searchableFields = [
        item.selected_passage || '',
        item.reflection || '',
        item.action_point || '',
        item.question || '',
        tagsSearchString,
      ];

      if (isRegexMode && compiledRegex) {
        return searchableFields.some((field) => compiledRegex.test(field));
      }

      return (
        searchableFields.some((field) => field.toLowerCase().includes(rawQuery)) ||
        itemTags.some((t) => t.includes(normalizedQuery))
      );
    });
  }, [entries, searchQuery, isRegexMode, filterBookId, filterType, filterTag, filterFavoritesOnly]);

  // Selection Logic
  function toggleSelectEntry(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSelectAllFiltered() {
    if (selectedIds.size === filteredEntries.length && filteredEntries.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredEntries.map((e) => e.id)));
    }
  }

  // Export Selected / All Helpers
  function getPayloadForExport(items) {
    return {
      export_version: '1.0',
      exported_at: new Date().toISOString(),
      total_entries: items.length,
      entries: items.map((entry) => ({
        id: entry.id,
        book: entry.books?.title || null,
        canto_or_part: entry.canto_or_part,
        chapter: entry.chapter,
        verse_or_section: entry.verse_or_section,
        passage_type: entry.passage_type,
        passage: entry.selected_passage,
        reflection: entry.reflection,
        action_point: entry.action_point,
        question: entry.question,
        is_favorite: entry.is_favorite,
        tags: entry.entry_tags?.map((t) => t.tags?.name) || [],
        created_at: entry.created_at,
        updated_at: entry.updated_at,
      })),
    };
  }

  function exportJSON(itemsToExport, filenamePrefix = 'prabhupada-study') {
    if (itemsToExport.length === 0) return alert('No entries selected for export.');
    const payload = getPayloadForExport(itemsToExport);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportDoc(itemsToExport, filenamePrefix = 'prabhupada-study-notes') {
    if (itemsToExport.length === 0) return alert('No entries selected for export.');

    const entriesHtml = itemsToExport
      .map((entry, idx) => {
        const source = `${entry.books?.title || ''}${
          entry.canto_or_part ? ` · Canto ${entry.canto_or_part}` : ''
        }${entry.chapter ? ` · Ch ${entry.chapter}` : ''}${
          entry.verse_or_section ? ` · Verse ${entry.verse_or_section}` : ''
        }`;
        const tags = entry.entry_tags?.map((t) => `#${t.tags?.name}`).join(' ') || '';

        return `
        <div style="margin-bottom: 28px; padding-bottom: 18px; border-bottom: 1px solid #d1d5db;">
          <h3 style="margin: 0 0 6px 0; color: #1e3a8a; font-size: 14pt;">${idx + 1}. ${source}</h3>
          <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 10pt;">Type: ${entry.passage_type} ${tags ? `| Tags: ${tags}` : ''}</p>
          <div style="margin: 12px 0; padding: 12px; background: #f3f4f6; border-left: 4px solid #3b82f6; font-style: italic; font-size: 11pt;">
            "${entry.selected_passage}"
          </div>
          ${
            entry.reflection
              ? `<p style="margin: 6px 0;"><strong>Reflection:</strong> ${entry.reflection}</p>`
              : ''
          }
          ${
            entry.action_point
              ? `<p style="margin: 6px 0;"><strong>Action Point:</strong> ${entry.action_point}</p>`
              : ''
          }
          ${
            entry.question
              ? `<p style="margin: 6px 0;"><strong>Question:</strong> ${entry.question}</p>`
              : ''
          }
        </div>`;
      })
      .join('');

    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>Study Notes</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.5; color: #111827; }
        </style>
      </head>
      <body>
        <h1 style="color: #0f172a; border-bottom: 2px solid #0f172a; padding-bottom: 8px;">Srila Prabhupada Study Notes</h1>
        <p style="color: #4b5563; font-size: 10pt;">Generated on ${new Date().toLocaleDateString()} · Total Records: ${itemsToExport.length}</p>
        ${entriesHtml}
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff' + htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const selectedEntriesList = useMemo(() => {
    return entries.filter((e) => selectedIds.has(e.id));
  }, [entries, selectedIds]);

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-top">
          <h1>Srila Prabhupada Study</h1>
          <button
            className="backup-btn"
            onClick={() => exportJSON(entries, 'prabhupada-study-full-backup')}
            title="Download Full Database Backup"
          >
            Backup JSON
          </button>
        </div>

        <nav className="tabs">
          <button
            className={activeTab === 'entries' ? 'active' : ''}
            onClick={() => setActiveTab('entries')}
          >
            Entries ({entries.length})
          </button>
          <button
            className={activeTab === 'add' ? 'active' : ''}
            onClick={() => {
              if (editingEntryId) resetForm();
              setActiveTab('add');
            }}
          >
            {editingEntryId ? '✎ Edit Entry' : '+ Quick Add'}
          </button>
          <button
            className={activeTab === 'revision' ? 'active' : ''}
            onClick={() => {
              setActiveTab('revision');
              if (!randomEntry && entries.length > 0) pickRandomEntry(false);
            }}
          >
            Revision
          </button>
          <button
            className={activeTab === 'regex-help' ? 'active' : ''}
            onClick={() => setActiveTab('regex-help')}
          >
            Regex Guide
          </button>
        </nav>
      </header>

      {/* FORM TAB */}
      {activeTab === 'add' && (
        <form className="study-form" onSubmit={handleSaveEntry}>
          <div className="form-header-bar">
            <h2>{editingEntryId ? 'Edit Study Entry' : 'New Study Entry'}</h2>
            {editingEntryId && (
              <button
                type="button"
                className="cancel-btn"
                onClick={() => {
                  resetForm();
                  setActiveTab('entries');
                }}
              >
                Cancel
              </button>
            )}
          </div>

          <div className="form-group">
            <label>Book</label>
            <select
              value={selectedBookId}
              onChange={(e) => setSelectedBookId(e.target.value)}
            >
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            {selectedBook?.has_cantos && (
              <div className="form-group">
                <label>Canto / Part</label>
                <input
                  type="text"
                  placeholder="e.g. 1"
                  value={canto}
                  onChange={(e) => setCanto(e.target.value)}
                />
              </div>
            )}
            <div className="form-group">
              <label>Chapter</label>
              <input
                type="text"
                placeholder="e.g. 2"
                value={chapter}
                onChange={(e) => setChapter(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Verse / Section</label>
              <input
                type="text"
                placeholder="e.g. 47"
                value={verse}
                onChange={(e) => setVerse(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Passage Type</label>
            <div className="radio-group">
              {['Paragraph', 'Verse', 'Quote'].map((type) => (
                <label key={type} className="radio-label">
                  <input
                    type="radio"
                    value={type}
                    checked={passageType === type}
                    onChange={(e) => setPassageType(e.target.value)}
                  />
                  {type}
                </label>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Selected Passage *</label>
            <textarea
              rows={4}
              placeholder="Paste the verse or purport paragraph here..."
              value={selectedPassage}
              onChange={(e) => setSelectedPassage(e.target.value)}
              required
            />
          </div>

          <div className="form-group relative">
            <label>Hashtags (separated by spaces or commas)</label>
            <input
              type="text"
              placeholder="#dharma #sensecontrol #bhakti"
              value={tagsInput}
              onChange={(e) => handleTagInputChange(e.target.value)}
            />
            {tagSuggestions.length > 0 && (
              <div className="autocomplete-menu">
                {tagSuggestions.map((tag) => (
                  <div
                    key={tag}
                    className="autocomplete-item"
                    onClick={() => applyTagSuggestion(tag)}
                  >
                    #{tag}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Personal Reflection</label>
            <textarea
              rows={3}
              placeholder="What did you understand or realize?"
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Practical Action Point</label>
            <textarea
              rows={2}
              placeholder="What do you want to practice?"
              value={actionPoint}
              onChange={(e) => setActionPoint(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Question</label>
            <textarea
              rows={2}
              placeholder="Something you want to understand further?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </div>

          <button type="submit" className="save-button" disabled={isSaving}>
            {isSaving ? 'Saving...' : editingEntryId ? 'Update Entry' : 'Save Study Entry'}
          </button>
        </form>
      )}

      {/* ENTRIES LIST TAB */}
      {activeTab === 'entries' && (
        <div className="entries-view">
          <div className="search-panel">
            <div className="search-bar-row">
              <input
                type="text"
                className="search-input"
                placeholder={
                  isRegexMode
                    ? "Enter Regex pattern..."
                    : "Search text across passages, tags, reflections..."
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={isRegexMode}
                  onChange={(e) => setIsRegexMode(e.target.checked)}
                />
                Regex
              </label>
            </div>

            {regexError && <p className="error-text">{regexError}</p>}

            <div className="filter-row">
              <select
                value={filterBookId}
                onChange={(e) => setFilterBookId(e.target.value)}
              >
                <option value="ALL">All Books</option>
                {books.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>

              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="ALL">All Types</option>
                <option value="Paragraph">Paragraph</option>
                <option value="Verse">Verse</option>
                <option value="Quote">Quote</option>
              </select>

              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={filterFavoritesOnly}
                  onChange={(e) => setFilterFavoritesOnly(e.target.checked)}
                />
                ★ Favorites
              </label>
            </div>

            {filterTag && (
              <div className="active-tag-filter">
                <span>Filtered by: <strong>#{filterTag}</strong></span>
                <button onClick={() => setFilterTag('')}>✕ Clear</button>
              </div>
            )}

            {/* SELECTION TOOLBAR */}
            <div className="selection-toolbar">
              <div className="select-left">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={
                      filteredEntries.length > 0 &&
                      selectedIds.size === filteredEntries.length
                    }
                    onChange={handleSelectAllFiltered}
                  />
                  <span>Select All ({filteredEntries.length})</span>
                </label>
              </div>

              {selectedIds.size > 0 && (
                <div className="export-actions">
                  <span className="selected-count">{selectedIds.size} selected:</span>
                  <button
                    className="export-pill-btn"
                    onClick={() => exportJSON(selectedEntriesList, 'selected-study-entries')}
                  >
                    JSON
                  </button>
                  <button
                    className="export-pill-btn doc"
                    onClick={() => exportDoc(selectedEntriesList, 'selected-study-notes')}
                  >
                    Doc
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="entries-list">
            {filteredEntries.length === 0 ? (
              <p className="empty-text">No matching entries found.</p>
            ) : (
              filteredEntries.map((entry) => {
                const isSelected = selectedIds.has(entry.id);
                return (
                  <div
                    key={entry.id}
                    className={`entry-card ${isSelected ? 'selected' : ''}`}
                  >
                    <div className="entry-header">
                      <div className="header-select-group">
                        <input
                          type="checkbox"
                          className="entry-checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectEntry(entry.id)}
                        />
                        <span className="badge-source">
                          {entry.books?.title}
                          {entry.canto_or_part ? ` · Canto ${entry.canto_or_part}` : ''}
                          {entry.chapter ? ` · Ch ${entry.chapter}` : ''}
                          {entry.verse_or_section ? ` · Verse ${entry.verse_or_section}` : ''}
                        </span>
                      </div>

                      <div className="card-controls">
                        <span className="badge-type">{entry.passage_type}</span>
                        <button
                          className={`star-button ${entry.is_favorite ? 'starred' : ''}`}
                          onClick={() => toggleFavorite(entry)}
                          title="Toggle Favorite"
                        >
                          {entry.is_favorite ? '★' : '☆'}
                        </button>
                      </div>
                    </div>

                    <p className="passage-text">"{entry.selected_passage}"</p>

                    {entry.entry_tags?.length > 0 && (
                      <div className="tags-container">
                        {entry.entry_tags.map((t, idx) => (
                          <span
                            key={idx}
                            className="tag-chip clickable"
                            onClick={() => setFilterTag(t.tags?.name)}
                          >
                            #{t.tags?.name}
                          </span>
                        ))}
                      </div>
                    )}

                    {entry.reflection && (
                      <div className="section-block reflection-block">
                        <strong>Reflection:</strong>
                        <p>{entry.reflection}</p>
                      </div>
                    )}

                    {entry.action_point && (
                      <div className="section-block action-block">
                        <strong>Action Point:</strong>
                        <p>{entry.action_point}</p>
                      </div>
                    )}

                    {entry.question && (
                      <div className="section-block question-block">
                        <strong>Question:</strong>
                        <p>{entry.question}</p>
                      </div>
                    )}

                    <div className="card-footer-actions">
                      <button
                        className="entry-action-btn edit"
                        onClick={() => startEditing(entry)}
                      >
                        ✎ Edit
                      </button>
                      <button
                        className="entry-action-btn delete"
                        onClick={() => handleDeleteEntry(entry.id)}
                      >
                        🗑 Delete
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* REVISION TAB */}
      {activeTab === 'revision' && (
        <div className="revision-view">
          <div className="revision-controls">
            <button
              className="action-button primary"
              onClick={() => pickRandomEntry(false)}
            >
              Study Random
            </button>
            <button
              className="action-button secondary"
              onClick={() => pickRandomEntry(true)}
            >
              Random Favorite
            </button>
          </div>

          {randomEntry ? (
            <div className="entry-card revision-card">
              <div className="entry-header">
                <span className="badge-source">
                  {randomEntry.books?.title}
                  {randomEntry.canto_or_part ? ` · Canto ${randomEntry.canto_or_part}` : ''}
                  {randomEntry.chapter ? ` · Ch ${randomEntry.chapter}` : ''}
                  {randomEntry.verse_or_section ? ` · Verse ${randomEntry.verse_or_section}` : ''}
                </span>
                <div className="card-controls">
                  <span className="badge-type">{randomEntry.passage_type}</span>
                  <button
                    className={`star-button ${randomEntry.is_favorite ? 'starred' : ''}`}
                    onClick={() => toggleFavorite(randomEntry)}
                  >
                    {randomEntry.is_favorite ? '★' : '☆'}
                  </button>
                </div>
              </div>

              <blockquote className="passage-text revision-passage">
                "{randomEntry.selected_passage}"
              </blockquote>

              {randomEntry.entry_tags?.length > 0 && (
                <div className="tags-container">
                  {randomEntry.entry_tags.map((t, idx) => (
                    <span key={idx} className="tag-chip">
                      #{t.tags?.name}
                    </span>
                  ))}
                </div>
              )}

              {randomEntry.reflection && (
                <div className="section-block reflection-block">
                  <strong>Reflection:</strong>
                  <p>{randomEntry.reflection}</p>
                </div>
              )}

              {randomEntry.action_point && (
                <div className="section-block action-block">
                  <strong>Action Point:</strong>
                  <p>{randomEntry.action_point}</p>
                </div>
              )}

              {randomEntry.question && (
                <div className="section-block question-block">
                  <strong>Question:</strong>
                  <p>{randomEntry.question}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="empty-text">Click a button above to review an entry.</p>
          )}
        </div>
      )}

      {/* REGEX HELP GUIDE TAB */}
      {activeTab === 'regex-help' && (
        <div className="guide-card">
          <h2>Regular Expression Guide</h2>
          <table className="guide-table">
            <thead>
              <tr>
                <th>Pattern</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>Krishna.*love</code></td>
                <td>Matches "Krishna" followed anywhere by "love"</td>
              </tr>
              <tr>
                <td><code>control|restrain</code></td>
                <td>Matches either word</td>
              </tr>
              <tr>
                <td><code>^The</code></td>
                <td>Passages that begin with "The"</td>
              </tr>
              <tr>
                <td><code>mind\b</code></td>
                <td>Exact word "mind", not "mindful"</td>
              </tr>
            </tbody>
          </table>
          <button className="save-button" onClick={() => setActiveTab('entries')}>
            Back to Entries
          </button>
        </div>
      )}
    </div>
  );
}