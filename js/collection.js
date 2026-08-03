(function () {
  'use strict';

  var root = document.querySelector('.ille-collection[data-sheet-id]');
  if (!root) return;

  var grid = document.getElementById('collectionGrid');
  var status = document.getElementById('collectionStatus');
  var searchInput = document.getElementById('collectionSearch');
  var languageSelect = document.getElementById('collectionLanguage');
  var sheetId = root.getAttribute('data-sheet-id');
  var sheetLimit = parseInt(root.getAttribute('data-sheet-limit'), 10) || 50;
  var rows = [];
  var loadedSheetCount = 0;

  function normalize(value) {
    return String(value || '').trim().toLowerCase();
  }

  function displayValue(value) {
    if (value === true) return 'Yes';
    if (value === false) return 'No';
    return String(value == null ? '' : value).trim();
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function validHttpUrl(value) {
    try {
      var url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (error) {
      return false;
    }
  }

  function findKey(keys, names) {
    var normalizedNames = names.map(normalize);
    var key = keys.find(function (candidate) {
      return normalizedNames.indexOf(normalize(candidate)) !== -1;
    });

    if (key) return key;

    return keys.find(function (candidate) {
      var normalizedCandidate = normalize(candidate);
      return normalizedNames.some(function (name) {
        return normalizedCandidate.indexOf(name) !== -1;
      });
    }) || '';
  }

  function valueFor(record, key) {
    return key ? displayValue(record[key]) : '';
  }

  function bookFromRecord(record) {
    var keys = Object.keys(record);
    var keyMap = {
      title: findKey(keys, ['book title', 'title', 'book', 'name']),
      author: findKey(keys, ['author', 'writer']),
      language: findKey(keys, ['language', 'languages']),
      collection: findKey(keys, ['collection', 'category', 'shelf']),
      cover: findKey(keys, ['cover url', 'cover image', 'cover', 'image url', 'image']),
      link: findKey(keys, ['book link', 'catalogue link', 'catalog link', 'url', 'link'])
    };
    var ignoredKeys = ['id', 's no', 's.no', 'serial number', 'timestamp'];
    var hiddenKeys = Object.keys(keyMap).map(function (name) {
      return keyMap[name];
    }).filter(Boolean);
    var allValues = keys.map(function (key) {
      return displayValue(record[key]);
    });
    var title = valueFor(record, keyMap.title) || allValues.find(Boolean) || '';

    if (!title) return null;

    return {
      title: title,
      author: valueFor(record, keyMap.author),
      language: valueFor(record, keyMap.language),
      collection: valueFor(record, keyMap.collection),
      cover: valueFor(record, keyMap.cover),
      link: valueFor(record, keyMap.link),
      details: keys.reduce(function (details, key) {
        var value = displayValue(record[key]);
        if (
          value &&
          hiddenKeys.indexOf(key) === -1 &&
          ignoredKeys.indexOf(normalize(key)) === -1
        ) {
          details.push({ label: key, value: value });
        }
        return details;
      }, []),
      searchText: normalize(allValues.join(' '))
    };
  }

  function addSheetRecords(records) {
    records.forEach(function (record) {
      var book = bookFromRecord(record);
      if (book) rows.push(book);
    });
  }

  function populateLanguages() {
    var languages = {};

    rows.forEach(function (row) {
      if (row.language) languages[row.language] = true;
    });

    Object.keys(languages)
      .sort(function (a, b) { return a.localeCompare(b); })
      .forEach(function (language) {
        var option = document.createElement('option');
        option.value = language;
        option.textContent = language;
        languageSelect.appendChild(option);
      });
  }

  function bookCard(book) {
    var title = book.title || 'Untitled book';
    var initial = title.trim().charAt(0).toUpperCase() || 'B';
    var coverHtml = validHttpUrl(book.cover)
      ? '<img src="' + escapeHtml(book.cover) + '" alt="Cover of ' + escapeHtml(title) + '" loading="lazy">'
      : '<span aria-hidden="true">' + escapeHtml(initial) + '</span>';
    var titleHtml = validHttpUrl(book.link)
      ? '<a href="' + escapeHtml(book.link) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(title) + '</a>'
      : escapeHtml(title);
    var tags = [book.language, book.collection].filter(Boolean).map(function (tag) {
      return '<span class="ille-book-tag">' + escapeHtml(tag) + '</span>';
    }).join('');
    var detailsHtml = book.details.length
      ? '<dl class="ille-book-details">' + book.details.map(function (detail) {
          return '<dt>' + escapeHtml(detail.label) + '</dt><dd>' + escapeHtml(detail.value) + '</dd>';
        }).join('') + '</dl>'
      : '';

    return '<article class="ille-book-card">' +
      '<div class="ille-book-cover">' + coverHtml + '</div>' +
      '<div class="ille-book-body">' +
        '<h2 class="ille-book-title">' + titleHtml + '</h2>' +
        (book.author ? '<p class="ille-book-author">' + escapeHtml(book.author) + '</p>' : '') +
        (tags ? '<div class="ille-book-tags">' + tags + '</div>' : '') +
        detailsHtml +
      '</div>' +
    '</article>';
  }

  function render() {
    var query = normalize(searchInput.value);
    var selectedLanguage = languageSelect.value;
    var filtered = rows.filter(function (book) {
      var matchesQuery = !query || book.searchText.indexOf(query) !== -1;
      var matchesLanguage = !selectedLanguage || book.language === selectedLanguage;
      return matchesQuery && matchesLanguage;
    });
    var tabText = loadedSheetCount === 1 ? '1 spreadsheet tab' : loadedSheetCount + ' spreadsheet tabs';

    status.textContent = filtered.length +
      (filtered.length === 1 ? ' book' : ' books') +
      ' across ' + tabText;

    if (!filtered.length) {
      grid.innerHTML = '<p class="ille-collection-empty">No books match these filters.</p>';
      return;
    }

    grid.innerHTML = filtered.map(bookCard).join('');
  }

  function showError(message) {
    status.textContent = message;
    grid.innerHTML = '<p class="ille-collection-empty">' + escapeHtml(message) + '</p>';
  }

  async function fetchSheet(sheetNumber) {
    var url = 'https://opensheet.elk.sh/' +
      encodeURIComponent(sheetId) + '/' +
      encodeURIComponent(sheetNumber);
    var response = await fetch(url);

    if (!response.ok) return null;

    var data = await response.json();
    return Array.isArray(data) ? data : null;
  }

  async function loadCollection() {
    var sheetNumber;

    try {
      for (sheetNumber = 1; sheetNumber <= sheetLimit; sheetNumber++) {
        status.textContent = 'Loading spreadsheet tab ' + sheetNumber + '…';

        var records = await fetchSheet(sheetNumber);
        if (records === null) break;

        loadedSheetCount += 1;
        addSheetRecords(records);
      }
    } catch (error) {
      if (!loadedSheetCount) {
        showError('The collection could not be loaded. Please use the spreadsheet link below.');
        return;
      }
    }

    if (!rows.length) {
      showError('No books are currently listed in the collection.');
      return;
    }

    populateLanguages();
    render();
  }

  searchInput.addEventListener('input', render);
  languageSelect.addEventListener('change', render);
  loadCollection();
})();
