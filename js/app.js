(function(){
  "use strict";
  var STORAGE_KEY = "yuuriEntries_v1";
  var DRAFT_KEY = "yuuriDraft_v1";
  var TODAY = new Date();

  var GOOGLE_BOOKS_API_KEY = ""; // optional: paste a Google Books API key here for higher rate limits

  var DEFAULT_GENRES = ["소설","에세이","자기계발","로맨스","추리","호러","판타지","과학","인문","시"];

  function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
  function normKey(title, author){ return (title||"").trim().toLowerCase() + "|" + (author||"").trim().toLowerCase(); }
  function escapeHtml(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];
    });
  }
  function sameDay(a,b){
    var da=new Date(a), db=new Date(b);
    return da.getFullYear()===db.getFullYear() && da.getMonth()===db.getMonth() && da.getDate()===db.getDate();
  }
  function fmtDate(iso){
    var d = new Date(iso);
    var weekday = ["일","월","화","수","목","금","토"][d.getDay()];
    return (d.getMonth()+1) + "월 " + d.getDate() + "일 (" + weekday + ")";
  }

  function bookThumbHtml(e){
    if(e.cover){
      return '<div class="card-cover"><img src="' + e.cover + '" alt=""></div>';
    }
    var d = new Date(e.createdAt);
    return '<div class="book-glyph"><span class="d">' + d.getDate() + '</span><span class="m">' + (d.getMonth()+1) + '월</span></div>';
  }

  var entries = [];
  try{
    var raw = localStorage.getItem(STORAGE_KEY);
    entries = raw ? JSON.parse(raw) : [];
  }catch(e){ entries = []; }
  function persist(){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); }catch(e){} }

  var currentFilter = "all";
  var currentType = "book";
  var currentBookMode = "search";
  var currentStatus = "reading";
  var currentRating = 0;
  var currentHasCover = false;
  var selectedBook = null;
  var selectedGenres = [];
  var sortDesc = true;
  var searchText = "";
  var editingId = null;
  var calendarMonth = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);

  var grid = document.getElementById("cardGrid");
  var tabBar = document.getElementById("tabBar");

  /* ---------------- render card grid ---------------- */
  function textMatches(e, q){
    if(!q) return true;
    q = q.toLowerCase();
    var hay = [e.title,e.author,e.publisher,e.reason,e.summary,e.quote,e.apply,e.did,e.mood,e.resolve]
      .concat(e.genres||[]).filter(Boolean).join(" ").toLowerCase();
    return hay.indexOf(q) > -1;
  }

  function bookSessionInfo(e){
    var siblings = entries.filter(function(x){ return x.type==="book" && x.bookId===e.bookId; })
      .sort(function(a,b){ return new Date(a.createdAt)-new Date(b.createdAt); });
    var idx = siblings.findIndex(function(x){ return x.id === e.id; });
    return { index: idx+1, total: siblings.length };
  }

  function render(){
    var filtered = entries.filter(function(e){
      if(currentFilter !== "all" && e.type !== currentFilter) return false;
      return textMatches(e, searchText);
    }).sort(function(a,b){
      var d = new Date(a.createdAt) - new Date(b.createdAt);
      return sortDesc ? -d : d;
    });

    document.getElementById("countAll").textContent = entries.length;
    document.getElementById("countBook").textContent = entries.filter(function(e){return e.type==="book";}).length;
    document.getElementById("countDiary").textContent = entries.filter(function(e){return e.type==="diary";}).length;

    if(!filtered.length){
      grid.innerHTML = '<div class="empty-state">'+(searchText? '검색 결과가 없어요.' : '아직 기록이 없어요. 위 "+ 새 기록 쓰기"로 첫 기록을 남겨보세요.')+'</div>';
      renderCalendar();
      return;
    }

    grid.innerHTML = filtered.map(function(e){
      if(e.type === "book"){
        var stars = "★".repeat(e.rating||0) + "☆".repeat(5-(e.rating||0));
        var sess = bookSessionInfo(e);
        var statusLabel = e.status === "done" ? "완독" : "읽는 중";
        var tagsHtml = (e.genres||[]).map(function(g){ return '<span class="card-tag">#'+escapeHtml(g)+'</span>'; }).join("");
        return '<button class="card book" data-id="' + e.id + '" type="button">'
          + bookThumbHtml(e)
          + '<div class="card-body">'
          + '<div class="card-kicker">독서록 <span class="card-status-pill">'+statusLabel+'</span>'+(sess.total>1?' <span class="card-status-pill">'+sess.index+'/'+sess.total+'회차</span>':'')+'</div>'
          + '<p class="card-title">' + escapeHtml(e.title) + (e.isAudiobook? ' <span class="audiobook-badge">🎧</span>' : '') + '</p>'
          + '<p class="card-meta">' + escapeHtml(e.author||"") + (e.publisher? ' · ' + escapeHtml(e.publisher):'') + (e.range? ' · '+escapeHtml(e.range):'') + '</p>'
          + '<p class="card-snippet">' + escapeHtml(e.summary||e.reason||"") + '</p>'
          + (tagsHtml ? '<div class="card-tags">'+tagsHtml+'</div>' : '')
          + '<div class="card-stars">' + stars + '</div>'
          + '</div></button>';
      }else{
        var d = new Date(e.createdAt);
        return '<button class="card diary" data-id="' + e.id + '" type="button">'
          + '<div class="diary-glyph"><span class="d">' + d.getDate() + '</span><span class="m">' + (d.getMonth()+1) + '월</span></div>'
          + '<div class="card-body">'
          + '<div class="card-kicker">일기</div>'
          + '<p class="card-title">' + fmtDate(e.createdAt) + '의 기록</p>'
          + '<p class="card-meta">' + escapeHtml(e.mood||"") + '</p>'
          + '<p class="card-snippet">' + escapeHtml(e.did||"") + '</p>'
          + '</div></button>';
      }
    }).join("");

    Array.prototype.forEach.call(grid.querySelectorAll(".card"), function(card){
      card.addEventListener("click", function(){ openDetail(card.getAttribute("data-id")); });
    });

    renderCalendar();
  }

  document.getElementById("textSearch").addEventListener("input", function(e){
    searchText = e.target.value.trim();
    render();
  });

  document.getElementById("sortToggle").addEventListener("click", function(){
    sortDesc = !sortDesc;
    this.textContent = sortDesc ? "최신순 ▾" : "오래된순 ▴";
    render();
  });

  Array.prototype.forEach.call(tabBar.querySelectorAll(".tab"), function(tab){
    tab.addEventListener("click", function(){
      Array.prototype.forEach.call(tabBar.querySelectorAll(".tab"), function(t){ t.classList.remove("active"); });
      tab.classList.add("active");
      currentFilter = tab.getAttribute("data-filter");
      render();
    });
  });

  /* ---------------- calendar ---------------- */
  function renderCalendar(){
    var y = calendarMonth.getFullYear(), m = calendarMonth.getMonth();
    document.getElementById("calTitle").textContent = y + "년 " + (m+1) + "월";
    var firstDow = new Date(y,m,1).getDay();
    var daysInMonth = new Date(y,m+1,0).getDate();
    var cells = [];
    for(var i=0;i<firstDow;i++) cells.push(null);
    for(var d=1; d<=daysInMonth; d++) cells.push(d);

    var dowHtml = ["일","월","화","수","목","금","토"].map(function(w){ return '<div class="cal-dow">'+w+'</div>'; }).join("");

    var cellsHtml = cells.map(function(d){
      if(d === null) return '<div class="cal-cell blank"></div>';
      var dateObj = new Date(y,m,d,12);
      var dayEntries = entries.filter(function(e){ return sameDay(e.createdAt, dateObj); });
      var bookEntries = dayEntries.filter(function(e){ return e.type === "book"; });
      var diaryEntries = dayEntries.filter(function(e){ return e.type === "diary"; });
      var isToday = sameDay(dateObj, TODAY);
      var cls = "cal-cell" + (dayEntries.length? " has-entry":"") + (isToday? " today":"");
      var inner = '<span class="cal-daynum mono">'+d+'</span>';
      if(bookEntries.length){
        inner += bookEntries[0].cover
          ? '<div class="cal-cover"><img src="'+bookEntries[0].cover+'" alt=""></div>'
          : '<div class="cal-cover cal-cover-emoji">💛</div>';
        if(bookEntries.length > 1) inner += '<span class="cal-stack-badge">+'+(bookEntries.length-1)+'</span>';
      }
      if(diaryEntries.length) inner += '<span class="cal-diary-dot" title="일기"></span>';
      var dateIso = dateObj.toISOString();
      return '<div class="'+cls+'" data-date="'+dateIso+'">'+inner+'</div>';
    }).join("");

    document.getElementById("calGrid").innerHTML = dowHtml + cellsHtml;

    Array.prototype.forEach.call(document.querySelectorAll(".cal-cell.has-entry"), function(cell){
      cell.addEventListener("click", function(){
        var iso = cell.getAttribute("data-date");
        var dayEntries = entries.filter(function(e){ return sameDay(e.createdAt, iso); });
        if(dayEntries.length === 1){ openDetail(dayEntries[0].id); }
        else{ openChooser(dayEntries); }
      });
    });
  }
  document.getElementById("calPrev").addEventListener("click", function(){
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth()-1, 1);
    renderCalendar();
  });
  document.getElementById("calNext").addEventListener("click", function(){
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth()+1, 1);
    renderCalendar();
  });

  var chooserOverlay = document.getElementById("chooserOverlay");
  function openChooser(dayEntries){
    var body = document.getElementById("chooserBody");
    body.innerHTML = dayEntries.map(function(e){
      if(e.type === "book"){
        var thumb = e.cover ? '<img src="'+e.cover+'" alt="">' : '<div class="sr-emoji">💛</div>';
        return '<div class="search-result" data-id="'+e.id+'">'+thumb+'<div><div class="sr-title">'+escapeHtml(e.title)+(e.isAudiobook? ' 🎧' : '')+'</div><div class="sr-meta">독서록 · '+escapeHtml(e.author||"")+'</div></div></div>';
      }
      return '<div class="search-result" data-id="'+e.id+'"><div class="diary-glyph" style="width:28px;height:40px;"><span class="d" style="font-size:12px;">'+new Date(e.createdAt).getDate()+'</span></div><div><div class="sr-title">일기</div><div class="sr-meta">'+escapeHtml(e.mood||"")+'</div></div></div>';
    }).join("");
    Array.prototype.forEach.call(body.querySelectorAll("[data-id]"), function(row){
      row.addEventListener("click", function(){
        chooserOverlay.classList.remove("open");
        openDetail(row.getAttribute("data-id"));
      });
    });
    chooserOverlay.classList.add("open");
  }
  document.getElementById("closeChooserBtn").addEventListener("click", function(){ chooserOverlay.classList.remove("open"); });
  chooserOverlay.addEventListener("click", function(e){ if(e.target === chooserOverlay) chooserOverlay.classList.remove("open"); });

  /* ---------------- write modal ---------------- */
  var writeOverlay = document.getElementById("writeOverlay");
  var bookFields = document.getElementById("bookFields");
  var diaryFields = document.getElementById("diaryFields");
  var searchModeBox = document.getElementById("searchModeBox");
  var manualModeBox = document.getElementById("manualModeBox");

  function openWrite(prefillEntry){
    writeOverlay.classList.add("open");
    resetForm();
    if(prefillEntry){
      editingId = prefillEntry.id;
      document.getElementById("writeTitle").textContent = prefillEntry.type === "book" ? "독서록 수정" : "일기 수정";
      setType(prefillEntry.type);
      if(prefillEntry.type === "book"){
        selectedBook = { title:prefillEntry.title, author:prefillEntry.author, publisher:prefillEntry.publisher, cover:prefillEntry.cover };
        currentHasCover = !!prefillEntry.hasCover;
        setBookMode("manual");
        document.getElementById("m_title").value = prefillEntry.title || "";
        document.getElementById("m_author").value = prefillEntry.author || "";
        document.getElementById("m_publisher").value = prefillEntry.publisher || "";
        showBookPreview(selectedBook);
        currentStatus = prefillEntry.status || "reading";
        updateStatusToggle();
        document.getElementById("f_audiobook").checked = !!prefillEntry.isAudiobook;
        document.getElementById("f_range").value = prefillEntry.range || "";
        document.getElementById("f_reason").value = prefillEntry.reason || "";
        document.getElementById("f_summary").value = prefillEntry.summary || "";
        document.getElementById("f_quote").value = prefillEntry.quote || "";
        document.getElementById("f_apply").value = prefillEntry.apply || "";
        currentRating = prefillEntry.rating || 0;
        renderStars();
        selectedGenres = (prefillEntry.genres || []).slice();
        renderGenreChips();
        updateReasonVisibility();
      }else{
        document.getElementById("d_did").value = prefillEntry.did || "";
        document.getElementById("d_mood").value = prefillEntry.mood || "";
        document.getElementById("d_resolve").value = prefillEntry.resolve || "";
      }
      hideDraftBanner();
    }else{
      checkDraft();
    }
  }
  function closeWrite(){ writeOverlay.classList.remove("open"); editingId = null; }

  document.getElementById("openWriteBtn").addEventListener("click", function(){ openWrite(null); });
  document.getElementById("closeWriteBtn").addEventListener("click", closeWrite);
  document.getElementById("cancelWriteBtn").addEventListener("click", closeWrite);
  writeOverlay.addEventListener("click", function(e){ if(e.target === writeOverlay) closeWrite(); });

  function setType(type){
    currentType = type;
    Array.prototype.forEach.call(document.querySelectorAll("#typeSegment button"), function(b){
      b.classList.toggle("active", b.getAttribute("data-type") === type);
    });
    bookFields.style.display = type === "book" ? "" : "none";
    diaryFields.style.display = type === "diary" ? "" : "none";
    if(!editingId) document.getElementById("writeTitle").textContent = type === "book" ? "새 독서록 쓰기" : "새 일기 쓰기";
  }
  Array.prototype.forEach.call(document.querySelectorAll("#typeSegment button"), function(btn){
    btn.addEventListener("click", function(){ setType(btn.getAttribute("data-type")); });
  });

  function setBookMode(mode){
    currentBookMode = mode;
    Array.prototype.forEach.call(document.querySelectorAll("#bookModeSegment button"), function(b){
      b.classList.toggle("active", b.getAttribute("data-mode") === mode);
    });
    searchModeBox.style.display = mode === "search" ? "" : "none";
    manualModeBox.style.display = mode === "manual" ? "" : "none";
    updateReasonVisibility();
  }

  function computeCurrentBookId(){
    var title, author;
    if(currentBookMode === "manual"){
      title = document.getElementById("m_title").value.trim();
      author = document.getElementById("m_author").value.trim();
    }else{
      if(selectedBook){ title = selectedBook.title; author = selectedBook.author; }
      else { title = searchInput.value.trim(); author = ""; }
    }
    if(!title) return null;
    return normKey(title, author);
  }
  function updateReasonVisibility(){
    var bid = computeCurrentBookId();
    var isAdditional = !!bid && entries.some(function(e){ return e.type === "book" && e.bookId === bid && e.id !== editingId; });
    document.getElementById("reasonFieldWrap").style.display = isAdditional ? "none" : "";
    document.getElementById("reasonSkipNote").style.display = isAdditional ? "" : "none";
  }
  document.getElementById("m_title").addEventListener("input", updateReasonVisibility);
  document.getElementById("m_author").addEventListener("input", updateReasonVisibility);
  Array.prototype.forEach.call(document.querySelectorAll("#bookModeSegment button"), function(btn){
    btn.addEventListener("click", function(){ setBookMode(btn.getAttribute("data-mode")); });
  });

  function updateStatusToggle(){
    Array.prototype.forEach.call(document.querySelectorAll(".status-opt"), function(b){
      b.classList.toggle("active", b.getAttribute("data-status") === currentStatus);
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll(".status-opt"), function(btn){
    btn.addEventListener("click", function(){ currentStatus = btn.getAttribute("data-status"); updateStatusToggle(); });
  });

  function renderGenreChips(){
    var box = document.getElementById("genreChips");
    var all = DEFAULT_GENRES.slice();
    selectedGenres.forEach(function(g){ if(all.indexOf(g) === -1) all.push(g); });
    box.innerHTML = all.map(function(g){
      return '<button type="button" class="chip'+(selectedGenres.indexOf(g)>-1?' selected':'')+'" data-genre="'+escapeHtml(g)+'">#'+escapeHtml(g)+'</button>';
    }).join("");
    Array.prototype.forEach.call(box.querySelectorAll(".chip"), function(chip){
      chip.addEventListener("click", function(){
        var g = chip.getAttribute("data-genre");
        var idx = selectedGenres.indexOf(g);
        if(idx > -1) selectedGenres.splice(idx,1); else selectedGenres.push(g);
        renderGenreChips();
      });
    });
  }
  document.getElementById("genreAddBtn").addEventListener("click", addCustomGenre);
  document.getElementById("genreCustomInput").addEventListener("keydown", function(e){
    if(e.key === "Enter"){ e.preventDefault(); addCustomGenre(); }
  });
  function addCustomGenre(){
    var input = document.getElementById("genreCustomInput");
    var val = input.value.trim();
    if(!val) return;
    if(selectedGenres.indexOf(val) === -1) selectedGenres.push(val);
    input.value = "";
    renderGenreChips();
  }

  function resetForm(){
    editingId = null;
    setType("book");
    setBookMode("search");
    currentStatus = "reading"; updateStatusToggle();
    selectedBook = null; currentRating = 0; currentHasCover = false; selectedGenres = [];
    document.getElementById("bookSearchInput").value = "";
    document.getElementById("searchResults").style.display = "none";
    document.getElementById("bookPreview").style.display = "none";
    ["m_title","m_author","m_publisher","f_range","f_reason","f_summary","f_quote","f_apply","d_did","d_mood","d_resolve","genreCustomInput"].forEach(function(id){
      document.getElementById(id).value = "";
    });
    document.getElementById("f_audiobook").checked = false;
    renderStars();
    renderGenreChips();
    updateReasonVisibility();
  }

  /* ---------------- real Google Books search ---------------- */
  var searchInput = document.getElementById("bookSearchInput");
  var searchResults = document.getElementById("searchResults");
  var searchDebounceTimer = null;
  var searchRequestId = 0;

  function secureThumb(url){
    if(!url) return null;
    return url.replace(/^http:\/\//i, "https://");
  }

  function fetchGoogleBooks(query){
    var url = "https://www.googleapis.com/books/v1/volumes?maxResults=8&q=" + encodeURIComponent(query);
    if(GOOGLE_BOOKS_API_KEY) url += "&key=" + encodeURIComponent(GOOGLE_BOOKS_API_KEY);
    return fetch(url).then(function(res){
      if(!res.ok) throw new Error("Google Books API error: " + res.status);
      return res.json();
    }).then(function(data){
      return (data.items || []).map(function(item){
        var info = item.volumeInfo || {};
        return {
          title: info.title || "제목 없음",
          author: (info.authors || []).join(", "),
          publisher: info.publisher || "",
          cover: secureThumb(info.imageLinks && (info.imageLinks.thumbnail || info.imageLinks.smallThumbnail))
        };
      });
    });
  }

  searchInput.addEventListener("input", function(){
    updateReasonVisibility();
    var q = searchInput.value.trim();
    clearTimeout(searchDebounceTimer);
    if(!q){ searchResults.style.display = "none"; return; }
    searchResults.style.display = "";
    searchResults.innerHTML = '<div class="search-status">검색 중…</div>';
    var myRequestId = ++searchRequestId;
    searchDebounceTimer = setTimeout(function(){
      fetchGoogleBooks(q).then(function(matches){
        if(myRequestId !== searchRequestId) return; // stale response, a newer search superseded this
        renderSearchResults(matches);
      }).catch(function(){
        if(myRequestId !== searchRequestId) return;
        searchResults.innerHTML = '<div class="search-status">검색에 실패했어요. 네트워크를 확인하거나 "직접 입력" 탭을 이용해주세요.</div>';
      });
    }, 400);
  });

  function renderSearchResults(matches){
    if(!matches.length){
      searchResults.innerHTML = '<div class="search-status">검색 결과가 없어요. "직접 입력" 탭을 이용해보세요.</div>';
      return;
    }
    searchResults.innerHTML = matches.map(function(b, i){
      var thumb = b.cover ? '<img src="'+escapeHtml(b.cover)+'" alt="">' : '<div class="sr-emoji">💛</div>';
      return '<div class="search-result" data-idx="' + i + '">'
        + thumb
        + '<div><div class="sr-title">' + escapeHtml(b.title) + '</div>'
        + '<div class="sr-meta">' + escapeHtml(b.author) + (b.publisher ? ' · ' + escapeHtml(b.publisher) : '') + '</div></div>'
        + '</div>';
    }).join("");
    Array.prototype.forEach.call(searchResults.querySelectorAll(".search-result[data-idx]"), function(row){
      row.addEventListener("click", function(){
        var book = matches[parseInt(row.getAttribute("data-idx"),10)];
        selectedBook = { title: book.title, author: book.author, publisher: book.publisher, cover: book.cover || null };
        currentHasCover = true;
        searchInput.value = book.title;
        searchResults.style.display = "none";
        showBookPreview(selectedBook);
        updateReasonVisibility();
      });
    });
  }

  function showBookPreview(book){
    var preview = document.getElementById("bookPreview");
    preview.style.display = "flex";
    var bpCover = document.getElementById("bpCover");
    var bpEmoji = document.getElementById("bpEmoji");
    if(book.cover){
      bpCover.src = book.cover;
      bpCover.style.display = "";
      bpEmoji.style.display = "none";
    }else{
      bpCover.style.display = "none";
      bpEmoji.style.display = "flex";
    }
    document.getElementById("bpTitle").textContent = book.title;
    document.getElementById("bpMeta").textContent = [book.author, book.publisher].filter(Boolean).join(" · ");
  }
  document.getElementById("coverUploadInput").addEventListener("change", function(e){
    var file = e.target.files[0];
    if(!file) return;
    var reader = new FileReader();
    reader.onload = function(ev){
      if(!selectedBook) selectedBook = { title: document.getElementById("m_title").value || "제목 없음", author:"", publisher:"" };
      selectedBook.cover = ev.target.result;
      currentHasCover = true;
      showBookPreview(selectedBook);
    };
    reader.readAsDataURL(file);
  });

  function renderStars(){
    var box = document.getElementById("starsInput");
    box.innerHTML = "";
    for(var i=1;i<=5;i++){
      (function(i){
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = i <= currentRating ? "★" : "☆";
        if(i <= currentRating) b.classList.add("filled");
        b.addEventListener("click", function(){ currentRating = (currentRating===i)?0:i; renderStars(); });
        box.appendChild(b);
      })(i);
    }
  }
  renderStars();
  renderGenreChips();

  Array.prototype.forEach.call(document.getElementById("moodChips").querySelectorAll(".chip"), function(chip){
    chip.addEventListener("click", function(){
      var field = document.getElementById("d_mood");
      field.value = field.value ? field.value + ", " + chip.textContent : chip.textContent;
    });
  });

  /* ---- draft autosave ---- */
  function collectFormState(){
    return {
      type: currentType, bookMode: currentBookMode, status: currentStatus, rating: currentRating,
      hasCover: currentHasCover, selectedBook: selectedBook, genres: selectedGenres,
      f_audiobook: document.getElementById("f_audiobook").checked,
      m_title: document.getElementById("m_title").value,
      m_author: document.getElementById("m_author").value,
      m_publisher: document.getElementById("m_publisher").value,
      f_range: document.getElementById("f_range").value,
      f_reason: document.getElementById("f_reason").value,
      f_summary: document.getElementById("f_summary").value,
      f_quote: document.getElementById("f_quote").value,
      f_apply: document.getElementById("f_apply").value,
      d_did: document.getElementById("d_did").value,
      d_mood: document.getElementById("d_mood").value,
      d_resolve: document.getElementById("d_resolve").value,
      bookSearch: searchInput.value
    };
  }
  var draftTimer = null;
  function scheduleDraftSave(){
    if(editingId) return;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(function(){
      try{ localStorage.setItem(DRAFT_KEY, JSON.stringify(collectFormState())); }catch(e){}
    }, 500);
  }
  document.getElementById("writePanelBody").addEventListener("input", scheduleDraftSave);

  function hideDraftBanner(){ document.getElementById("draftBanner").style.display = "none"; }
  function checkDraft(){
    var raw;
    try{ raw = localStorage.getItem(DRAFT_KEY); }catch(e){}
    if(raw){ document.getElementById("draftBanner").style.display = "flex"; }
    else hideDraftBanner();
  }
  document.getElementById("draftDiscardBtn").addEventListener("click", function(){
    try{ localStorage.removeItem(DRAFT_KEY); }catch(e){}
    hideDraftBanner();
  });
  document.getElementById("draftLoadBtn").addEventListener("click", function(){
    var raw;
    try{ raw = localStorage.getItem(DRAFT_KEY); }catch(e){}
    if(!raw) return;
    var s = JSON.parse(raw);
    setType(s.type || "book");
    setBookMode(s.bookMode || "search");
    currentStatus = s.status || "reading"; updateStatusToggle();
    currentRating = s.rating || 0; renderStars();
    currentHasCover = !!s.hasCover;
    selectedGenres = s.genres || []; renderGenreChips();
    selectedBook = s.selectedBook || null;
    if(selectedBook) showBookPreview(selectedBook);
    searchInput.value = s.bookSearch || "";
    document.getElementById("f_audiobook").checked = !!s.f_audiobook;
    document.getElementById("m_title").value = s.m_title || "";
    document.getElementById("m_author").value = s.m_author || "";
    document.getElementById("m_publisher").value = s.m_publisher || "";
    document.getElementById("f_range").value = s.f_range || "";
    document.getElementById("f_reason").value = s.f_reason || "";
    document.getElementById("f_summary").value = s.f_summary || "";
    document.getElementById("f_quote").value = s.f_quote || "";
    document.getElementById("f_apply").value = s.f_apply || "";
    document.getElementById("d_did").value = s.d_did || "";
    document.getElementById("d_mood").value = s.d_mood || "";
    document.getElementById("d_resolve").value = s.d_resolve || "";
    hideDraftBanner();
  });

  function clearDraft(){ try{ localStorage.removeItem(DRAFT_KEY); }catch(e){} }

  function doSave(){
    if(currentType === "book"){
      var title, author, publisher, cover;
      if(currentBookMode === "manual"){
        title = document.getElementById("m_title").value.trim();
        author = document.getElementById("m_author").value.trim();
        publisher = document.getElementById("m_publisher").value.trim();
        cover = (selectedBook && selectedBook.cover) || null;
      }else{
        title = selectedBook ? selectedBook.title : searchInput.value.trim();
        author = selectedBook ? selectedBook.author : "";
        publisher = selectedBook ? selectedBook.publisher : "";
        cover = selectedBook ? selectedBook.cover : null;
      }
      if(!title){ (currentBookMode==="manual"?document.getElementById("m_title"):searchInput).focus(); return; }
      var payload = {
        type:"book", bookId: normKey(title, author),
        title: title, author: author, publisher: publisher, cover: cover,
        status: currentStatus, isAudiobook: document.getElementById("f_audiobook").checked,
        range: document.getElementById("f_range").value,
        reason: document.getElementById("reasonFieldWrap").style.display === "none" ? "" : document.getElementById("f_reason").value,
        summary: document.getElementById("f_summary").value,
        quote: document.getElementById("f_quote").value,
        apply: document.getElementById("f_apply").value,
        rating: currentRating, genres: selectedGenres.slice(), hasCover: currentHasCover
      };
      if(editingId){
        entries = entries.map(function(e){ return e.id === editingId ? Object.assign({}, e, payload) : e; });
      }else{
        payload.id = uid(); payload.createdAt = new Date().toISOString();
        entries.push(payload);
      }
    }else{
      var did = document.getElementById("d_did").value;
      var mood = document.getElementById("d_mood").value;
      var resolve = document.getElementById("d_resolve").value;
      if(!editingId && !did && !mood && !resolve) return;
      var dPayload = { type:"diary", did: did, mood: mood, resolve: resolve };
      if(editingId){
        entries = entries.map(function(e){ return e.id === editingId ? Object.assign({}, e, dPayload) : e; });
      }else{
        dPayload.id = uid(); dPayload.createdAt = new Date().toISOString();
        entries.push(dPayload);
      }
    }
    persist();
    clearDraft();
    render();
    closeWrite();
  }

  document.getElementById("saveBtn").addEventListener("click", function(){
    if(editingId){
      showConfirm("수정", "수정 내용은 기존 기록에 바로 반영됩니다.", doSave);
    }else{
      doSave();
    }
  });

  /* ---------------- confirm modal ---------------- */
  var confirmOverlay = document.getElementById("confirmOverlay");
  var pendingConfirmAction = null;
  function showConfirm(actionWord, subText, onOk){
    document.getElementById("confirmActionWord").textContent = actionWord;
    document.getElementById("confirmSub").textContent = subText || "";
    pendingConfirmAction = onOk;
    confirmOverlay.classList.add("open");
  }
  function hideConfirm(){ confirmOverlay.classList.remove("open"); pendingConfirmAction = null; }
  document.getElementById("closeConfirmBtn").addEventListener("click", hideConfirm);
  document.getElementById("confirmCancelBtn").addEventListener("click", hideConfirm);
  confirmOverlay.addEventListener("click", function(e){ if(e.target === confirmOverlay) hideConfirm(); });
  document.getElementById("confirmOkBtn").addEventListener("click", function(){
    var action = pendingConfirmAction;
    hideConfirm();
    if(action) action();
  });

  /* ---------------- detail modal ---------------- */
  var detailOverlay = document.getElementById("detailOverlay");
  var detailBody = document.getElementById("detailBody");
  var activeDetailId = null;

  function section(label, val){
    return '<div class="detail-section"><h4>' + label + '</h4><p>' + escapeHtml(val || "-") + '</p></div>';
  }
  function openDetail(id){
    var e = entries.find(function(x){ return x.id === id; });
    if(!e) return;
    activeDetailId = id;
    if(e.type === "book"){
      var stars = "★".repeat(e.rating||0) + "☆".repeat(5-(e.rating||0));
      var sess = bookSessionInfo(e);
      var statusLabel = e.status === "done" ? "완독" : "읽는 중";
      var tagsHtml = (e.genres||[]).map(function(g){ return '<span class="card-tag">#'+escapeHtml(g)+'</span>'; }).join("");
      var siblings = entries.filter(function(x){ return x.type==="book" && x.bookId===e.bookId; })
        .sort(function(a,b){ return new Date(a.createdAt)-new Date(b.createdAt); });
      var siblingsHtml = "";
      if(siblings.length > 1){
        siblingsHtml = '<div class="detail-section"><h4>이 책의 다른 기록 (총 '+siblings.length+'회차)</h4><div class="chips">'
          + siblings.map(function(s, i){
              var isCurrent = s.id === e.id;
              return '<button type="button" class="chip'+(isCurrent?' selected':'')+'" data-sibling-id="'+s.id+'" '+(isCurrent?'disabled':'')+'>'
                + (i+1) + '회차 · ' + fmtDate(s.createdAt) + '</button>';
            }).join("")
          + '</div></div>';
      }
      var headThumb;
      if(e.cover){
        headThumb = '<img src="' + e.cover + '" alt="">';
      }else{
        headThumb = '<div class="book-glyph" style="width:62px;height:88px;"><span class="d">' + new Date(e.createdAt).getDate() + '</span><span class="m">' + (new Date(e.createdAt).getMonth()+1) + '월</span></div>';
      }
      detailBody.innerHTML =
        '<div class="detail-kicker">독서록 <span class="detail-session-badge">'+statusLabel+'</span>'+(sess.total>1?' <span class="detail-session-badge">'+sess.index+'/'+sess.total+'회차</span>':'')+'</div>'
        + '<div class="detail-head">' + headThumb
        + '<div><h3 class="detail-title">' + escapeHtml(e.title) + (e.isAudiobook? ' <span class="audiobook-badge">🎧</span>' : '') + '</h3>'
        + '<div class="detail-meta">' + escapeHtml(e.author||"") + (e.publisher?' · '+escapeHtml(e.publisher):'') + '</div>'
        + '<div class="detail-meta">' + fmtDate(e.createdAt) + (e.range?' · 읽은 범위 '+escapeHtml(e.range):'') + '</div>'
        + '<div class="detail-meta" style="color:var(--mustard)">' + stars + '</div></div></div>'
        + (tagsHtml? '<div class="card-tags" style="margin-bottom:12px;">'+tagsHtml+'</div>' : '')
        + siblingsHtml
        + (sess.index === 1 ? section("읽게 된 계기", e.reason) : "")
        + section("줄거리 요약", e.summary)
        + section("인상 깊은 구절", e.quote)
        + section("내 삶에 적용할 점", e.apply);
      Array.prototype.forEach.call(detailBody.querySelectorAll("[data-sibling-id]"), function(btn){
        btn.addEventListener("click", function(){ openDetail(btn.getAttribute("data-sibling-id")); });
      });
    }else{
      detailBody.innerHTML =
        '<div class="detail-kicker diary">일기</div>'
        + '<h3 class="detail-title">' + fmtDate(e.createdAt) + '의 기록</h3>'
        + section("오늘 한 일", e.did)
        + section("감정 및 기분", e.mood)
        + section("내일의 다짐", e.resolve);
    }
    detailOverlay.classList.add("open");
  }
  function closeDetail(){ detailOverlay.classList.remove("open"); activeDetailId = null; }
  document.getElementById("closeDetailBtn").addEventListener("click", closeDetail);
  document.getElementById("closeDetailBtn2").addEventListener("click", closeDetail);
  detailOverlay.addEventListener("click", function(e){ if(e.target === detailOverlay) closeDetail(); });

  document.getElementById("editBtn").addEventListener("click", function(){
    var e = entries.find(function(x){ return x.id === activeDetailId; });
    if(!e) return;
    closeDetail();
    openWrite(e);
  });

  document.getElementById("deleteBtn").addEventListener("click", function(){
    if(!activeDetailId) return;
    showConfirm("삭제", "삭제 후에는 되돌릴 수 없어요.", function(){
      entries = entries.filter(function(e){ return e.id !== activeDetailId; });
      persist();
      render();
      closeDetail();
    });
  });

  /* ---------------- export template (shared by PDF + PNG) ---------------- */
  function unitFieldsHtml(e){
    var stars = "★".repeat(e.rating||0) + "☆".repeat(5-(e.rating||0));
    var html = '<p class="et-meta">' + fmtDate(e.createdAt) + (e.range?' · '+escapeHtml(e.range):'') + ' · ' + stars + '</p>';
    if(e.reason) html += '<div class="et-field"><span class="et-lbl">읽게 된 계기</span><span class="et-val">'+escapeHtml(e.reason)+'</span></div>';
    html += '<div class="et-field"><span class="et-lbl">줄거리 요약</span><span class="et-val">'+escapeHtml(e.summary||"-")+'</span></div>';
    html += '<div class="et-field"><span class="et-lbl">인상 깊은 구절</span><span class="et-val">'+escapeHtml(e.quote||"-")+'</span></div>';
    html += '<div class="et-field"><span class="et-lbl">내 삶에 적용할 점</span><span class="et-val">'+escapeHtml(e.apply||"-")+'</span></div>';
    return html;
  }
  function unitToTemplateHtml(u){
    if(u.kind === "diary"){
      var e = u.entry;
      return '<div class="et-entry">'
        + '<p class="et-title">' + fmtDate(e.createdAt) + '의 기록</p>'
        + '<div class="et-field"><span class="et-lbl">오늘 한 일</span><span class="et-val">'+escapeHtml(e.did||"-")+'</span></div>'
        + '<div class="et-field"><span class="et-lbl">감정 및 기분</span><span class="et-val">'+escapeHtml(e.mood||"-")+'</span></div>'
        + '<div class="et-field"><span class="et-lbl">내일의 다짐</span><span class="et-val">'+escapeHtml(e.resolve||"-")+'</span></div>'
        + '</div>';
    }
    var first = u.sessions[0];
    var head = '<p class="et-title">'+escapeHtml(first.title)+(first.isAudiobook? ' 🎧' : '')+'</p>'
      + '<p class="et-meta">'+escapeHtml(first.author||"")+(first.publisher?' · '+escapeHtml(first.publisher):'')+'</p>';
    var body = u.sessions.map(function(e, i){
      var label = u.sessions.length > 1 ? '<p class="et-session-label">'+(i+1)+'회차</p>' : "";
      return '<div class="et-session">' + label + unitFieldsHtml(e) + '</div>';
    }).join("");
    return '<div class="et-entry">' + head + body + '</div>';
  }
  function buildExportTemplateHtml(units){
    return '<div class="export-template">'
      + '<div class="et-brand"><span class="et-brand-emoji">🍋</span><h1>Yuuri</h1></div>'
      + '<p class="et-sub">Women\'s Cave</p>'
      + units.map(unitToTemplateHtml).join("")
      + '</div>';
  }
  function withRenderedTemplate(units, fn){
    var host = document.getElementById("exportRenderHost");
    host.innerHTML = buildExportTemplateHtml(units);
    var node = host.firstElementChild;
    Promise.resolve(fn(node)).then(function(){ host.innerHTML = ""; }, function(err){
      host.innerHTML = "";
      console.error(err);
      alert("파일 생성에 실패했어요. 다시 시도해주세요.");
    });
  }

  document.getElementById("printDetailBtn").addEventListener("click", function(){
    var e = entries.find(function(x){ return x.id === activeDetailId; });
    if(!e) return;
    var unit = e.type === "book" ? { kind:"book", sessions:[e] } : { kind:"diary", entry:e };
    exportUnitsToPdf([unit]);
  });

  /* ---------------- export (select entries -> PDF or PNG) ---------------- */
  var exportOverlay = document.getElementById("exportOverlay");
  var exportList = document.getElementById("exportList");
  var exportSelectAll = document.getElementById("exportSelectAll");

  function groupBooksByTitle(list){
    var groups = [];
    var byBookId = {};
    list.forEach(function(e){
      if(!byBookId[e.bookId]){
        byBookId[e.bookId] = { bookId: e.bookId, title: e.title, sessions: [] };
        groups.push(byBookId[e.bookId]);
      }
      byBookId[e.bookId].sessions.push(e);
    });
    groups.forEach(function(g){ g.sessions.sort(function(a,b){ return new Date(a.createdAt)-new Date(b.createdAt); }); });
    return groups;
  }

  function openExportModal(){
    var sorted = entries.slice().sort(function(a,b){ return new Date(b.createdAt)-new Date(a.createdAt); });
    var books = sorted.filter(function(e){ return e.type === "book"; });
    var diaries = sorted.filter(function(e){ return e.type === "diary"; });
    var bookGroups = groupBooksByTitle(books);
    function bookRowsHtml(){
      return bookGroups.map(function(g){
        var ids = g.sessions.map(function(e){ return e.id; }).join(",");
        var label = g.title + (g.sessions.length > 1 ? " (전체 " + g.sessions.length + "회차)" : "");
        return '<label class="export-row"><input type="checkbox" class="export-check" data-group="book" data-ids="' + ids + '" checked> ' + escapeHtml(label) + '</label>';
      }).join("");
    }
    function diaryRowsHtml(){
      return diaries.map(function(e){
        var label = fmtDate(e.createdAt) + " 일기";
        return '<label class="export-row"><input type="checkbox" class="export-check" data-group="diary" data-ids="' + e.id + '" checked> ' + escapeHtml(label) + '</label>';
      }).join("");
    }
    function groupTitleHtml(label, groupKey){
      return '<label class="export-group-title"><input type="checkbox" class="export-group-all" data-group="' + groupKey + '" checked> ' + label + ' 전체</label>';
    }
    var html = "";
    if(bookGroups.length) html += groupTitleHtml("독서록", "book") + bookRowsHtml();
    if(diaries.length) html += groupTitleHtml("일기", "diary") + diaryRowsHtml();
    exportList.innerHTML = html || '<div class="search-status">내보낼 기록이 없어요.</div>';
    exportSelectAll.checked = true;
    Array.prototype.forEach.call(exportList.querySelectorAll(".export-group-all"), function(groupCb){
      groupCb.addEventListener("change", function(){
        var g = groupCb.getAttribute("data-group");
        Array.prototype.forEach.call(exportList.querySelectorAll(".export-check[data-group=\"" + g + "\"]"), function(cb){
          cb.checked = groupCb.checked;
        });
      });
    });
    exportOverlay.classList.add("open");
  }
  document.getElementById("openExportBtn").addEventListener("click", openExportModal);
  document.getElementById("closeExportBtn").addEventListener("click", function(){ exportOverlay.classList.remove("open"); });
  exportOverlay.addEventListener("click", function(e){ if(e.target === exportOverlay) exportOverlay.classList.remove("open"); });
  exportSelectAll.addEventListener("change", function(){
    Array.prototype.forEach.call(exportList.querySelectorAll(".export-check, .export-group-all"), function(cb){ cb.checked = exportSelectAll.checked; });
  });

  function getSelectedExportUnits(){
    var ids = [];
    Array.prototype.forEach.call(exportList.querySelectorAll(".export-check:checked"), function(cb){
      ids = ids.concat(cb.getAttribute("data-ids").split(","));
    });
    var selectedEntries = entries.filter(function(e){ return ids.indexOf(e.id) > -1; });
    var bookGroups = groupBooksByTitle(selectedEntries.filter(function(e){ return e.type === "book"; }));
    var diaryEntries = selectedEntries.filter(function(e){ return e.type === "diary"; });
    var units = bookGroups.map(function(g){
      var latest = g.sessions.reduce(function(max, e){ return new Date(e.createdAt) > new Date(max) ? e.createdAt : max; }, g.sessions[0].createdAt);
      return { kind:"book", sessions: g.sessions, latest: latest };
    }).concat(diaryEntries.map(function(e){
      return { kind:"diary", entry: e, latest: e.createdAt };
    }));
    units.sort(function(a,b){ return new Date(b.latest) - new Date(a.latest); });
    return units;
  }

  function timestamp(){ return new Date().toISOString().slice(0,10).replace(/-/g,""); }

  function exportUnitsToPdf(units){
    if(!units.length) return;
    var RENDER_WIDTH = 800;
    var SCALE = 2;
    withRenderedTemplate(units, function(node){
      return window.html2canvas(node, { backgroundColor:"#FFFCF2", scale: SCALE }).then(function(canvas){
        var doc = new window.jspdf.jsPDF({ unit:"pt", format:"a4" });
        var margin = 24;
        var pageWidthPt = doc.internal.pageSize.getWidth();
        var pageHeightPt = doc.internal.pageSize.getHeight();
        var contentWidthPt = pageWidthPt - margin * 2;
        var contentHeightPt = pageHeightPt - margin * 2;
        var cssPxPerPt = RENDER_WIDTH / contentWidthPt;
        var pageHeightCss = contentHeightPt * cssPxPerPt;
        var totalCss = node.scrollHeight;

        // prefer breaking between entries rather than mid-paragraph
        var breakpointsCss = Array.prototype.map.call(node.querySelectorAll(".et-entry"), function(el){
          return el.offsetTop + el.offsetHeight;
        });
        if(!breakpointsCss.length || breakpointsCss[breakpointsCss.length - 1] < totalCss - 1){
          breakpointsCss.push(totalCss);
        }

        var ranges = [];
        var cursor = 0;
        while(cursor < totalCss - 0.5){
          var limit = cursor + pageHeightCss;
          var chosen = null;
          for(var i = 0; i < breakpointsCss.length; i++){
            if(breakpointsCss[i] > cursor + 0.5 && breakpointsCss[i] <= limit) chosen = breakpointsCss[i];
          }
          if(chosen === null) chosen = Math.min(limit, totalCss);
          ranges.push([cursor, chosen]);
          cursor = chosen;
        }

        ranges.forEach(function(range, idx){
          var topCss = range[0], bottomCss = range[1];
          var sliceHeightCss = bottomCss - topCss;
          var sliceCanvas = document.createElement("canvas");
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = Math.max(1, Math.round(sliceHeightCss * SCALE));
          var ctx = sliceCanvas.getContext("2d");
          ctx.fillStyle = "#FFFCF2"; ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
          ctx.drawImage(canvas, 0, Math.round(topCss * SCALE), canvas.width, sliceCanvas.height, 0, 0, canvas.width, sliceCanvas.height);
          var imgData = sliceCanvas.toDataURL("image/jpeg", 0.92);
          if(idx > 0) doc.addPage();
          var sliceHeightPt = sliceHeightCss / cssPxPerPt;
          doc.addImage(imgData, "JPEG", margin, margin, contentWidthPt, sliceHeightPt);
        });

        doc.save("yuuri-기록-" + timestamp() + ".pdf");
      });
    });
  }

  function exportUnitsToPng(units){
    if(!units.length) return;
    withRenderedTemplate(units, function(node){
      return window.html2canvas(node, { backgroundColor:"#FFFCF2", scale: 2 }).then(function(canvas){
        return new Promise(function(resolve, reject){
          canvas.toBlob(function(blob){
            if(!blob){ reject(new Error("toBlob failed")); return; }
            var a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "yuuri-기록-" + timestamp() + ".png";
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            resolve();
          }, "image/png");
        });
      });
    });
  }

  document.getElementById("exportPdfBtn").addEventListener("click", function(){
    var units = getSelectedExportUnits();
    exportOverlay.classList.remove("open");
    exportUnitsToPdf(units);
  });

  document.getElementById("exportPngBtn").addEventListener("click", function(){
    var units = getSelectedExportUnits();
    exportOverlay.classList.remove("open");
    exportUnitsToPng(units);
  });

  document.addEventListener("keydown", function(ev){
    if(ev.key === "Escape"){ closeWrite(); closeDetail(); hideConfirm(); chooserOverlay.classList.remove("open"); exportOverlay.classList.remove("open"); }
  });

  render();

  /* ---------------- PWA: service worker ---------------- */
  if("serviceWorker" in navigator){
    window.addEventListener("load", function(){
      navigator.serviceWorker.register("service-worker.js").catch(function(err){
        console.warn("Service worker registration failed:", err);
      });
    });
  }
})();
