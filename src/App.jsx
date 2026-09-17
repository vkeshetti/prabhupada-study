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

  // Revision / Random State
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
      setSelectedBookId(data[0].id);
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

  async function handleSaveEntry(e) {
    e.preventDefault();
    if (!selectedPassage.trim()) return alert('Please enter a passage.');
    setIsSaving(true);

    try {
      const { data: entryData, error: entryError } = await supabase
        .from('study_entries')
        .insert({
          book_id: selectedBookId,
          canto_or_part: selectedBook?.has_cantos ? canto : null,
          chapter: chapter || null,
          verse_or_section: verse || null,
          passage_type: passageType,
          selected_passage: selectedPassage,
          reflection: reflection || null,
          action_point: actionPoint || null,
          question: question || null,
        })
        .select()
        .single();

      if (entryError) throw entryError;

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
            .insert({ entry_id: entryData.id, tag_id: tagData.id });
        }
      }

      setSelectedPassage('');
      setReflection('');
      setActionPoint('');
      setQuestion('');
      setTagsInput('');
      setCanto('');
      setChapter('');
      setVerse('');
      fetchEntries();
      fetchTags();
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

  // Random Entry Generator
  function pickRandomEntry(favoritesOnly = false) {
    let pool = entries;
    if (favoritesOnly) {
      pool = entries.filter((e) => e.is_favorite);
    }
    if (pool.length === 0) {
      alert(
        favoritesOnly
          ? 'No favorite entries saved yet. Star some entries first!'
          : 'No study entries available to review.'
      );
      return;
    }
    const randomIndex = Math.floor(Math.random() * pool.length);
    setRandomEntry(pool[randomIndex]);
  }

  // JSON Data Export
  function exportBackupJSON() {
    if (entries.length === 0) return alert('No study entries to export.');
    const backupPayload = {
      export_version: '1.0',
      exported_at: new Date().toISOString(),
      total_entries: entries.length,
      entries: entries.map((entry) => ({
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

    const blob = new Blob([JSON.stringify(backupPayload, null, 2)], {
      type: 'application/json',
    });
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = downloadUrl;
    anchor.download = `prabhupada-study-backup-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(downloadUrl);
  }

  // Filter & Search Engine
  const filteredEntries = useMemo(() => {
    setRegexError('');
    let compiledRegex = null;

    if (isRegexMode && searchQuery.trim()) {
      try {
        compiledRegex = new RegExp(searchQuery, 'i');
      } catch (err) {
        setRegexError('Invalid regex syntax: ' + err.message);
        return [];
      }
    }

    const rawQuery = searchQuery.trim().toLowerCase();
    // Normalize query so searching with or without '#' works
    const normalizedQuery = rawQuery.startsWith('#') ? rawQuery.slice(1) : rawQuery;

    return entries.filter((item) => {
      // 1. Favorites Filter
      if (filterFavoritesOnly && !item.is_favorite) return false;

      // 2. Book Filter
      if (filterBookId !== 'ALL' && item.book_id !== filterBookId) return false;

      // 3. Passage Type Filter
      if (filterType !== 'ALL' && item.passage_type !== filterType) return false;

      // 4. Tag Chip Filter (when clicking a badge)
      const itemTags = item.entry_tags?.map((t) => t.tags?.name?.toLowerCase()) || [];
      if (filterTag && !itemTags.includes(filterTag.toLowerCase())) return false;

      // 5. Query Search
      if (!searchQuery.trim()) return true;

      // Formatted tags string containing both "dharma" and "#dharma"
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

      // Check standard text search against fields, or tag match
      return (
        searchableFields.some((field) => field.toLowerCase().includes(rawQuery)) ||
        itemTags.some((t) => t.includes(normalizedQuery))
      );
    });
  }, [entries, searchQuery, isRegexMode, filterBookId, filterType, filterTag, filterFavoritesOnly]);

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-top">
          <h1>Srila Prabhupada Study Repository</h1>
          <button
            className="backup-btn"
            onClick={exportBackupJSON}
            title="Download JSON Backup"
          >
            Export JSON
          </button>
        </div>
        <nav className="tabs">
          <button
            className={activeTab === 'entries' ? 'active' : ''}
            onClick={() => setActiveTab('entries')}
          >
            Study Entries ({entries.length})
          </button>
          <button
            className={activeTab === 'add' ? 'active' : ''}
            onClick={() => setActiveTab('add')}
          >
            + Quick Add
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

      {/* QUICK ADD TAB */}
      {activeTab === 'add' && (
        <form className="study-form" onSubmit={handleSaveEntry}>
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
            {isSaving ? 'Saving...' : 'Save Study Entry'}
          </button>
        </form>
      )}

      {/* ENTRIES & SEARCH TAB */}
      {activeTab === 'entries' && (
        <div className="entries-view">
          <div className="search-panel">
            <div className="search-bar-row">
              <input
                type="text"
                className="search-input"
                placeholder={
                  isRegexMode
                    ? "Enter Regex (e.g. Krishna.*love)..."
                    : "Search text across passages and reflections..."
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
                Regex Mode
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
                <button onClick={() => setFilterTag('')}>Clear Tag Filter</button>
              </div>
            )}
          </div>

          <div className="entries-list">
            {filteredEntries.length === 0 ? (
              <p className="empty-text">No matching entries found.</p>
            ) : (
              filteredEntries.map((entry) => (
                <div key={entry.id} className="entry-card">
                  <div className="entry-header">
                    <span className="badge-source">
                      {entry.books?.title}
                      {entry.canto_or_part ? ` · Canto ${entry.canto_or_part}` : ''}
                      {entry.chapter ? ` · Ch ${entry.chapter}` : ''}
                      {entry.verse_or_section ? ` · Verse ${entry.verse_or_section}` : ''}
                    </span>
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
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* REVISION / RANDOM STUDY TAB */}
      {activeTab === 'revision' && (
        <div className="revision-view">
          <div className="revision-controls">
            <button
              className="action-button primary"
              onClick={() => pickRandomEntry(false)}
            >
              Give Me Something to Study
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
                    title="Toggle Favorite"
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
                  <strong>My Reflection:</strong>
                  <p>{randomEntry.reflection}</p>
                </div>
              )}

              {randomEntry.action_point && (
                <div className="section-block action-block">
                  <strong>Practical Action Point:</strong>
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
            <p className="empty-text">Click a button above to load a random entry for study.</p>
          )}
        </div>
      )}

      {/* REGEX HELP GUIDE TAB */}
      {activeTab === 'regex-help' && (
        <div className="guide-card">
          <h2>Regular Expression (Regex) Guide</h2>
          <p>
            Regular expressions allow you to search with flexible patterns rather than
            strict identical words.
          </p>

          <table className="guide-table">
            <thead>
              <tr>
                <th>Pattern</th>
                <th>Meaning</th>
                <th>Example</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>Krishna.*love</code></td>
                <td>Matches "Krishna" followed anywhere later by "love"</td>
                <td>"...Krishna gives His pure love..."</td>
              </tr>
              <tr>
                <td><code>control|restrain</code></td>
                <td>Matches either "control" OR "restrain"</td>
                <td>Finds verses with either synonym</td>
              </tr>
              <tr>
                <td><code>^The</code></td>
                <td>Passages that start with "The"</td>
                <td>Beginning-of-text anchor</td>
              </tr>
              <tr>
                <td><code>mind\b</code></td>
                <td>Matches the exact word "mind", not "mindful"</td>
                <td>Word boundary match</td>
              </tr>
              <tr>
                <td><code>bhakti[a-z]*</code></td>
                <td>Matches "bhakti", "bhaktis", "bhaktivedanta"</td>
                <td>Prefix wildcard match</td>
              </tr>
            </tbody>
          </table>
          <button className="save-button" onClick={() => setActiveTab('entries')}>
            Back to Study Entries
          </button>
        </div>
      )}
    </div>
  );
}