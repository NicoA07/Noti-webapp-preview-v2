/* ============================================================
   render.js — DOM rendering from AppData (v3 "Dashboard")
   ============================================================
   Reads from AppData and UIState (defined in data.js).
   Writes to the DOM.

   Public API (all on the global Render object):
     Render.dashboard()             — renders the whole Home screen
     Render.category(cat)           — renders one notification category list
     Render.editScreen(section, id) — populates the edit screen from a data item
     Render.editSubtasks(subtasks)  — re-renders just the subtask list
     Render.savedTasks(filter)      — renders the Tasks screen
     Render.savedKeep(filter)       — renders the Keep screen
     Render.navBadges()             — bottom bar + drawer count badges
   ============================================================ */

var Render = (function () {
  /* ---------- Utility ---------- */

  function esc(str) {
    var d = document.createElement("div");
    d.textContent = str || "";
    return d.innerHTML;
  }

  function escAttr(str) {
    return (str || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  var MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  // "2026-07-09" → "Jul 9"
  function shortDate(iso) {
    if (!iso) return "";
    var parts = iso.split("-");
    if (parts.length !== 3) return iso;
    return MONTHS[parseInt(parts[1], 10) - 1] + " " + parseInt(parts[2], 10);
  }

  function hasUnseenUpdate(item) {
    return (item.updates || []).some(function (u) {
      return !u.seen;
    });
  }

  /* ---------- Task card HTML ---------- */

  function cardChipsHTML(item) {
    var chips = "";
    if (item.isNew) {
      var cls = item.state === "task" ? "chip-new-task" : "chip-new-keep";
      chips += '<span class="card-chip ' + cls + '">New</span>';
    }
    if (hasUnseenUpdate(item)) {
      chips +=
        '<span class="card-chip chip-updated"><i class="ti ti-refresh"></i> Updated</span>';
    }
    return chips;
  }

  function taskCardHTML(item) {
    var sts = item.subtasks || [];
    var vc = item.visibleCount != null ? item.visibleCount : sts.length;
    var visible = sts.slice(0, vc);
    var hidden = sts.slice(vc);
    var hasMore = hidden.length > 0;
    var showAmber = hasUnseenUpdate(item);

    function subtaskRowHTML(st) {
      var ic = st.checked ? "ti-square-check" : "ti-square";
      var amber =
        showAmber && st.addedByUpdate ? " subtask-added-by-update" : "";
      return (
        '<div class="subtask-row' +
        amber +
        '">' +
        '<i class="ti ' +
        ic +
        '" data-subtask-id="' +
        st.id +
        '"></i>' +
        '<span class="subtask-label">' +
        esc(st.label) +
        "</span>" +
        '<i class="ti ti-dots-vertical subtask-menu"></i>' +
        "</div>"
      );
    }

    var rows = visible.map(subtaskRowHTML).join("");

    var moreRow = "";
    var extraBlock = "";
    if (hasMore) {
      moreRow =
        '<div class="subtask-row subtask-more">' +
        '<i class="ti ti-dots"></i>' +
        "<span>" +
        hidden.length +
        " more sub-tasks</span>" +
        "</div>";
      extraBlock =
        '<div class="extra-subtasks">' +
        hidden.map(subtaskRowHTML).join("") +
        "</div>";
    }

    var subtaskWrap =
      sts.length > 0
        ? '<div class="subtask-wrap">' +
          '<div class="indent-guide"></div>' +
          '<div class="subtasks">' +
          rows +
          moreRow +
          extraBlock +
          "</div>" +
          "</div>"
        : "";

    return (
      '<div class="card' +
      (showAmber ? " card-has-update" : "") +
      '" data-item-id="' +
      item.id +
      '">' +
      '<div class="card-header">' +
      '<p class="card-title">' +
      esc(item.title) +
      "</p>" +
      cardChipsHTML(item) +
      '<div class="card-actions">' +
      '<i class="ti ti-pencil edit-task-trigger"></i>' +
      '<i class="ti ti-bell"></i>' +
      '<i class="ti ti-trash card-delete-trigger"></i>' +
      '<i class="ti ti-chevron-down card-expand-toggle"></i>' +
      "</div>" +
      "</div>" +
      '<div class="card-body">' +
      '<div class="card-contents">' +
      esc(item.contents) +
      "</div>" +
      subtaskWrap +
      "</div>" +
      "</div>"
    );
  }

  /* ---------- Notification card HTML ---------- */

  function notifCardHTML(notif) {
    return (
      '<div class="notif-card" data-item-id="' +
      notif.id +
      '">' +
      '<div class="notif-logo ' +
      notif.logoClass +
      '">' +
      '<i class="ti ' +
      notif.icon +
      '"></i>' +
      "</div>" +
      '<div class="notif-body">' +
      '<div class="notif-top-row">' +
      '<span class="notif-app-name">' +
      esc(notif.app) +
      "</span>" +
      '<span class="notif-top-spacer"></span>' +
      '<span class="notif-time">' +
      esc(notif.time) +
      "</span>" +
      "</div>" +
      '<div class="notif-subtitle">' +
      notif.subtitle +
      "</div>" + // may contain &middot;
      '<div class="notif-contents">' +
      esc(notif.contents) +
      "</div>" +
      "</div>" +
      '<div class="notif-actions">' +
      '<i class="ti ti-chevron-down notif-chevron"></i>' +
      // '<i class="ti ti-pin"></i>' +
      "</div>" +
      "</div>"
    );
  }

  /* ---------- Dashboard: greeting ---------- */

  function renderGreeting() {
    var titleEl = document.querySelector(".dash-greeting-title");
    var dateEl = document.querySelector(".dash-greeting-date");
    if (titleEl) {
      titleEl.textContent = "Good " + DataHelpers.dayPart().toLowerCase();
    }
    if (dateEl) {
      var now = new Date();
      var days = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ];
      dateEl.textContent =
        days[now.getDay()] +
        ", " +
        MONTHS[now.getMonth()] +
        " " +
        now.getDate();
    }
  }

  /* ---------- Dashboard: summary digest ---------- */

  var SUMMARY_MAX = 5;

  function renderSummary() {
    var cluster = document.querySelector(".digest-icon-cluster");
    var title = document.querySelector(".digest-title");
    var sub = document.querySelector(".digest-sub");
    var bodyInner = document.querySelector(".digest-body-inner");
    if (!cluster || !bodyInner) return;

    var total = AppData.notifications.length;
    var apps = DataHelpers.getSummaryApps();
    var recent = DataHelpers.getSummaryNotifs(SUMMARY_MAX);

    if (UIState.dashboard.summaryDismissed) {
      cluster.innerHTML =
        '<span class="cluster-logo" style="background: #22c55e;">' +
        '<i class="ti ti-check"></i>' +
        "</span>";
    } else {
      cluster.innerHTML = apps
        .map(function (n) {
          return (
            '<span class="cluster-logo ' +
            n.logoClass +
            '">' +
            '<i class="ti ' +
            n.icon +
            '"></i>' +
            "</span>"
          );
        })
        .join("");
    }

    if (title) {
      title.textContent = "Your " + DataHelpers.dayPart() + " Summary";
    }
    if (sub) {
      if (UIState.dashboard.summaryDismissed) {
        sub.textContent = "No new notifications";
      } else {
        sub.textContent =
          total === 0
            ? "No new notifications"
            : total + (total === 1 ? " notification" : " notifications");
      }
    }

    var isDismissed = UIState.dashboard.summaryDismissed;

    if (isDismissed || recent.length === 0) {
      bodyInner.innerHTML =
        '<div class="digest-caught-up">' +
        '<i class="ti ti-circle-check digest-caught-up-icon"></i>' +
        '<span class="digest-caught-up-text">You\'re all caught up</span>' +
        "</div>";
    } else {
      bodyInner.innerHTML =
        '<button class="digest-dismiss">' +
        '<i class="ti ti-trash"></i> Dismiss all' +
        "</button>" +
        '<div style="padding: 0 2px; display: flex; flex-direction: column; gap: 6px; padding-top: 12px; padding-bottom: 4px;">' +
        recent.map(notifCardHTML).join("") +
        "</div>" +
        '<button class="digest-view-all">' +
        "View all in Primary &amp; Social" +
        "</button>";
    }
    initNotifBehaviors(bodyInner);

    // Restore expand state — dismissed cards stay open
    var card = document.querySelector(".digest-card");
    var body = document.querySelector(".digest-body");
    if (card && body) {
      var open = UIState.dashboard.summaryDismissed || UIState.dashboard.summaryExpanded;
      card.classList.toggle("open", open);
      card.classList.toggle("dismissed-state", UIState.dashboard.summaryDismissed);
      body.style.height = open ? "auto" : "0px";
    }
  }

  /* ---------- Dashboard: What's new (activity) ---------- */

  function diffLineHTML(change) {
    var icon = change.type === "date" ? "ti-calendar-event" : "ti-plus";
    return (
      '<div class="diff-line">' +
      '<i class="ti ' +
      icon +
      '"></i>' +
      "<span>" +
      esc(DataHelpers.describeChange(change)) +
      "</span>" +
      "</div>"
    );
  }

  function activityEntryHTML(item) {
    var unseen = (item.updates || []).filter(function (u) {
      return !u.seen;
    });
    var changeCount = unseen.reduce(function (sum, u) {
      return sum + u.changes.length;
    }, 0);
    var latest = unseen[unseen.length - 1];
    var open = !!UIState.dashboard.openActivity[item.id];

    var diffLines = unseen
      .map(function (u) {
        return u.changes.map(diffLineHTML).join("");
      })
      .join("");

    return (
      '<div class="activity-entry' +
      (open ? " open" : "") +
      '" data-item-id="' +
      item.id +
      '" data-source="savedTasks">' +
      '<button class="activity-head">' +
      '<span class="activity-icon"><i class="ti ti-refresh"></i></span>' +
      '<span class="activity-text">' +
      '<span class="activity-title">' +
      esc(item.title) +
      "</span>" +
      '<span class="activity-sub">' +
      changeCount +
      (changeCount === 1 ? " change" : " changes") +
      " &middot; from " +
      esc(latest.sourceApp) +
      " &middot; " +
      esc(latest.time) +
      "</span>" +
      "</span>" +
      '<i class="ti ti-chevron-down activity-chevron"></i>' +
      "</button>" +
      '<div class="activity-diff"' +
      (open ? "" : " hidden") +
      ">" +
      diffLines +
      '<button class="activity-open-btn">' +
      '<i class="ti ti-arrow-right"></i> Open task' +
      "</button>" +
      "</div>" +
      "</div>"
    );
  }

  function renderActivity() {
    var variant = UIState.dashboard.whatsNewVariant || "original";
    var origEl = document.querySelector(".whats-new-original");
    var redesignEl = document.querySelector(".whats-new-redesign");
    if (origEl) origEl.hidden = variant !== "original";
    if (redesignEl) redesignEl.hidden = variant !== "redesign";

    if (variant === "redesign") {
      renderActivityRedesign();
      return;
    }

    var chipsEl = document.querySelector(".new-chips");
    var feedEl = document.querySelector(".activity-feed");
    if (!chipsEl || !feedEl) return;

    var counts = DataHelpers.getNewCounts();
    var chips = "";
    if (counts.tasks > 0) {
      chips +=
        '<button class="new-chip new-chip-task" data-goto="tasks">' +
        '<i class="ti ti-checklist"></i> ' +
        counts.tasks +
        " new " +
        (counts.tasks === 1 ? "Task" : "Tasks") +
        "</button>";
    }
    if (counts.keep > 0) {
      chips +=
        '<button class="new-chip new-chip-keep" data-goto="keep">' +
        '<i class="ti ti-bookmark"></i> ' +
        counts.keep +
        " new Keep" +
        "</button>";
    }
    chipsEl.innerHTML = chips;

    var updated = DataHelpers.getUpdatedTasks();
    if (updated.length === 0 && chips === "") {
      feedEl.innerHTML =
        '<div class="section-empty">You\'re all caught up</div>';
    } else {
      feedEl.innerHTML = updated.map(activityEntryHTML).join("");
    }
  }

  /* ---------- Dashboard: What's new — REDESIGN variant ---------- */

  var MAX_DIFF_LINES = 3;
  var MAX_SOURCES = 2;

  function newItemCardHTML(entry, index, total) {
    var item = entry.item;
    var isTask = entry.section === "savedTasks";
    var typeClass = isTask ? "wn-card-top-task" : "wn-card-top-keep";
    var typeChipClass = isTask ? "wn-type-task" : "wn-type-keep";
    var typeIcon = isTask ? "ti-checklist" : "ti-bookmark";
    var typeLabel = isTask ? "Task" : "Keep";

    // Attempt to find a source notification for this item
    var sourceText = "";
    // New items don't have sourceNotifId, so we show a generic source
    // In a real app, the LLM extraction would carry source info
    sourceText = isTask ? "LLM extraction" : "LLM extraction";

    return (
      '<div class="wn-card ' + typeClass + '">' +
        '<div class="wn-card-header">' +
          '<span class="wn-type ' + typeChipClass + '">' +
            '<i class="ti ' + typeIcon + '"></i> ' + typeLabel +
          '</span>' +
          '<span class="wn-dot">&middot;</span>' +
          '<span class="wn-source">' + esc(sourceText) + '</span>' +
        '</div>' +
        '<div class="wn-card-body">' +
          '<div class="wn-card-title">' + esc(item.title) + '</div>' +
          '<div class="wn-card-content">' + esc(item.contents) + '</div>' +
        '</div>' +
        '<div class="wn-card-actions">' +
          '<button class="wn-btn wn-btn-approve" data-item-id="' + item.id +
            '" data-source="' + entry.section + '">' +
            '<i class="ti ti-check"></i> Approve</button>' +
          '<div class="wn-btn-divider"></div>' +
          '<button class="wn-btn wn-btn-edit" data-item-id="' + item.id +
            '" data-source="' + entry.section + '">' +
            '<i class="ti ti-pencil"></i> Edit</button>' +
          '<div class="wn-btn-divider"></div>' +
          '<button class="wn-btn wn-btn-discard" data-item-id="' + item.id +
            '" data-source="' + entry.section + '">' +
            '<i class="ti ti-x"></i> Discard</button>' +
        '</div>' +
      '</div>'
    );
  }

  function updateCardHTML(item) {
    var summary = DataHelpers.getUnseenChangeSummary(item);
    var changes = summary.changes;
    var sources = summary.sources;
    var latest = summary.latest;
    var isOpen = !!UIState.dashboard.openUpdateCard[item.id];

    var changeCount = changes.length;
    var sourceCount = sources.length;

    // Preview text for collapsed state
    var previewText = DataHelpers.describeChangesPreview(changes);

    // Build diff lines (capped)
    var visibleChanges = changes.slice(0, MAX_DIFF_LINES);
    var extraChanges = changes.length - MAX_DIFF_LINES;

    var diffHTML = visibleChanges.map(function (c) {
      if (c.type === "date") {
        return (
          '<div class="wn-diff-line">' +
            '<i class="ti ti-calendar-event"></i>' +
            '<span><span class="wn-diff-old">' + esc(c.from) + '</span> ' +
            '<span class="wn-diff-arrow">→</span> ' +
            '<span class="wn-diff-new">' + esc(c.to) + '</span></span>' +
          '</div>'
        );
      }
      if (c.type === "subtask-added") {
        return (
          '<div class="wn-diff-line">' +
            '<i class="ti ti-plus"></i>' +
            '<span class="wn-diff-added">+ ' + esc(c.label) + '</span>' +
          '</div>'
        );
      }
      if (c.type === "subtask-removed") {
        return (
          '<div class="wn-diff-line">' +
            '<i class="ti ti-minus"></i>' +
            '<span class="wn-diff-removed">- ' + esc(c.label) + '</span>' +
          '</div>'
        );
      }
      return (
        '<div class="wn-diff-line">' +
          '<i class="ti ti-edit"></i>' +
          '<span>' + esc(DataHelpers.describeChange(c)) + '</span>' +
        '</div>'
      );
    }).join("");

    if (extraChanges > 0) {
      diffHTML +=
        '<div class="wn-more-text">+' + extraChanges +
        ' more ' + (extraChanges === 1 ? 'change' : 'changes') + '</div>';
    }

    // Build source rows (capped)
    var visibleSources = sources.slice(0, MAX_SOURCES);
    var extraSources = sources.length - MAX_SOURCES;

    var sourcesHTML = visibleSources.map(function (src) {
      var notif = DataHelpers.findNotification(src.notifId);
      var logoClass = notif ? notif.logoClass : "";
      var icon = notif ? notif.icon : "ti-bell";
      var subtitle = notif ? notif.subtitle : src.app;
      var snippet = notif ? notif.contents.substring(0, 60) + "..." : "";

      return (
        '<div class="wn-source-row" data-notif-id="' + src.notifId + '">' +
          '<div class="wn-source-logo ' + logoClass + '">' +
            '<i class="ti ' + icon + '"></i>' +
          '</div>' +
          '<div class="wn-source-text">' +
            '<div class="wn-source-app">' + subtitle + '</div>' +
            '<div class="wn-source-snippet">' + esc(snippet) + '</div>' +
          '</div>' +
          '<i class="ti ti-chevron-right wn-source-chevron"></i>' +
        '</div>'
      );
    }).join("");

    if (extraSources > 0) {
      sourcesHTML +=
        '<div class="wn-more-text">+' + extraSources +
        ' more ' + (extraSources === 1 ? 'source' : 'sources') + '</div>';
    }

    return (
      '<div class="wn-card wn-card-top-update" data-item-id="' + item.id + '" data-source="savedTasks">' +
        '<div class="wn-upd-header">' +
          '<div class="wn-upd-icon"><i class="ti ti-refresh"></i></div>' +
          '<div class="wn-upd-meta">' +
            '<div class="wn-upd-label">Task updated</div>' +
            '<div class="wn-upd-title">' + esc(item.title) + '</div>' +
            '<div class="wn-upd-summary">' +
              esc(latest.time) + ' &middot; ' +
              changeCount + (changeCount === 1 ? ' change' : ' changes') + ' &middot; ' +
              sourceCount + (sourceCount === 1 ? ' source' : ' sources') +
            '</div>' +
          '</div>' +
          '<i class="ti ti-chevron-down wn-upd-chevron' + (isOpen ? ' open' : '') + '"></i>' +
        '</div>' +
        // Collapsed preview
        (isOpen ? '' :
          '<div class="wn-upd-preview">' + esc(previewText) + '</div>'
        ) +
        // Expanded detail
        (isOpen ?
          '<div class="wn-upd-detail">' +
            '<div class="wn-upd-diff">' + diffHTML + '</div>' +
            '<div class="wn-upd-sources">' +
              '<div class="wn-upd-sources-label">' +
                '<i class="ti ti-link"></i> Triggered by ' +
                sourceCount + (sourceCount === 1 ? ' notification' : ' notifications') +
              '</div>' +
              sourcesHTML +
            '</div>' +
          '</div>'
        : '') +
        '<div class="wn-card-actions">' +
          '<button class="wn-btn wn-btn-view" data-item-id="' + item.id +
            '" data-source="savedTasks">' +
            '<i class="ti ti-arrow-right"></i> View task</button>' +
          '<div class="wn-btn-divider"></div>' +
          '<button class="wn-btn wn-btn-dismiss" data-item-id="' + item.id +
            '" data-source="savedTasks">' +
            '<i class="ti ti-check"></i> Dismiss</button>' +
        '</div>' +
      '</div>'
    );
  }

  function dotsHTML(total, active) {
    var html = '<div class="wn-dots">';
    for (var i = 0; i < total; i++) {
      html += '<div class="wn-dot-ind' + (i === active ? ' active' : '') + '"></div>';
    }
    html += '</div>';
    return html;
  }

  function renderActivityRedesign() {
    var newSection = document.querySelector(".wn-new-section");
    var updateSection = document.querySelector(".wn-update-section");
    var separator = document.querySelector(".wn-separator");
    if (!newSection || !updateSection) return;

    // --- New items carousel ---
    var newItems = DataHelpers.getNewItems();
    var ni = UIState.dashboard.newItemIndex;
    // Clamp index
    if (ni >= newItems.length) ni = Math.max(0, newItems.length - 1);
    UIState.dashboard.newItemIndex = ni;

    if (newItems.length === 0) {
      newSection.innerHTML = '<div class="section-empty">No new items</div>';
    } else {
      var entry = newItems[ni];
      newSection.innerHTML =
        '<div class="wn-carousel">' +
          '<button class="wn-arrow wn-arrow-left' + (ni === 0 ? ' disabled' : '') +
            '" data-dir="prev" data-carousel="new">' +
            '<i class="ti ti-chevron-left"></i></button>' +
          newItemCardHTML(entry, ni, newItems.length) +
          '<button class="wn-arrow wn-arrow-right' + (ni >= newItems.length - 1 ? ' disabled' : '') +
            '" data-dir="next" data-carousel="new">' +
            '<i class="ti ti-chevron-right"></i></button>' +
        '</div>' +
        dotsHTML(newItems.length, ni) +
        '<div class="wn-counter">' + (ni + 1) + ' of ' + newItems.length + ' awaiting review</div>';
    }

    // --- Update cards carousel ---
    var updated = DataHelpers.getUpdatedTasks();
    var ui = UIState.dashboard.updateIndex;
    if (ui >= updated.length) ui = Math.max(0, updated.length - 1);
    UIState.dashboard.updateIndex = ui;

    if (updated.length === 0 && newItems.length === 0) {
      newSection.innerHTML = '<div class="section-empty">You\'re all caught up</div>';
      updateSection.innerHTML = '';
      if (separator) separator.hidden = true;
    } else if (updated.length === 0) {
      updateSection.innerHTML = '';
      if (separator) separator.hidden = true;
    } else {
      if (separator) separator.hidden = false;
      var item = updated[ui];
      updateSection.innerHTML =
        '<div class="wn-carousel">' +
          '<button class="wn-arrow wn-arrow-left' + (ui === 0 ? ' disabled' : '') +
            '" data-dir="prev" data-carousel="update">' +
            '<i class="ti ti-chevron-left"></i></button>' +
          updateCardHTML(item) +
          '<button class="wn-arrow wn-arrow-right' + (ui >= updated.length - 1 ? ' disabled' : '') +
            '" data-dir="next" data-carousel="update">' +
            '<i class="ti ti-chevron-right"></i></button>' +
        '</div>' +
        dotsHTML(updated.length, ui) +
        '<div class="wn-counter">' + (ui + 1) + ' of ' + updated.length +
        (updated.length === 1 ? ' update' : ' updates') + '</div>';
    }
  }

  /* ---------- Dashboard: pinned row ---------- */

  function miniCardHTML(entry) {
    var item = entry.item;
    var isTask = entry.section === "savedTasks";
    var typeLabel = isTask
      ? '<span class="mini-type mini-type-task"><i class="ti ti-checklist"></i> Task</span>'
      : '<span class="mini-type mini-type-keep"><i class="ti ti-bookmark"></i> Keep</span>';
    var dateLine = item.date
      ? '<span class="mini-date"><i class="ti ti-calendar-event"></i> ' +
        shortDate(item.date) +
        "</span>"
      : '<span class="mini-date mini-date-empty">No date</span>';

    return (
      '<button class="mini-card ' +
      (isTask ? "mini-task" : "mini-keep") +
      '" data-item-id="' +
      item.id +
      '" data-source="' +
      entry.section +
      '">' +
      typeLabel +
      '<span class="mini-title">' +
      esc(item.title) +
      "</span>" +
      dateLine +
      "</button>"
    );
  }

  function renderPinned() {
    var row = document.querySelector(".pinned-row");
    if (!row) return;
    var pinned = DataHelpers.getPinned();
    row.innerHTML =
      pinned.length === 0
        ? '<div class="section-empty">Pin a task or keep item to see it here</div>'
        : pinned.map(miniCardHTML).join("");
  }

  function renderDashboard() {
    renderGreeting();
    renderSummary();
    renderActivity();
    renderPinned();
    updateNavBadges();
  }

  /* ---------- Category screens ---------- */

  function renderCategory(cat) {
    var list = document.querySelector(
      '.notif-list[data-category="' + cat + '"]',
    );
    if (!list) return;
    var items = DataHelpers.getNotifsByCategory(cat);
    list.innerHTML =
      items.length === 0
        ? '<div class="section-empty">No ' + cat + " notifications</div>"
        : items.map(notifCardHTML).join("");
    initNotifBehaviors(list);

    var countEl = document.querySelector('[data-category-count="' + cat + '"]');
    if (countEl) {
      countEl.textContent = items.length > 0 ? "(" + items.length + ")" : "";
    }
    updateNavBadges();
  }

  /* ---------- Edit screen population ---------- */

  function renderEditScreen(section, id) {
    var item = DataHelpers.find(section, id);
    if (!item) return;

    // Title
    document.querySelector(".edit-title").textContent = item.title;

    // State toggle
    document.querySelectorAll(".state-chip").forEach(function (chip) {
      chip.classList.toggle("active", chip.dataset.state === item.state);
    });

    // Date / time
    var dateInput = document.querySelector('.notion-body input[type="date"]');
    var timeInput = document.querySelector('.notion-body input[type="time"]');
    if (dateInput) dateInput.value = item.date || "";
    if (timeInput) timeInput.value = item.time || "";

    // Description
    var textarea = document.querySelector(".description-area");
    if (textarea) {
      textarea.value = item.contents || "";
      // trigger auto-resize
      textarea.style.height = "auto";
      textarea.style.height = textarea.scrollHeight + "px";
    }

    // Subtasks
    renderEditSubtasks(item.subtasks || []);
  }

  function renderEditSubtasks(subtasks) {
    var container = document.querySelector(".subtasks-section");
    if (!container) return;

    var html = subtasks
      .map(function (st) {
        var ic = st.checked ? "ti-square-check" : "ti-square";
        return (
          '<div class="edit-subtask-row" data-subtask-id="' +
          st.id +
          '">' +
          '<i class="ti ' +
          ic +
          '"></i>' +
          '<input type="text" class="invisible-input" value="' +
          escAttr(st.label) +
          '" />' +
          '<i class="ti ti-trash delete-subtask"></i>' +
          "</div>"
        );
      })
      .join("");

    html +=
      '<button class="add-subtask-btn"><i class="ti ti-plus"></i> Add Sub-task</button>';
    container.innerHTML = html;
  }

  /* ---------- Card behavior initialization ----------
     Must run after innerHTML so the elements exist in the DOM and
     offsetHeight / scrollHeight give real measurements.

     - Capture collapsed height via offsetHeight
     - On expand: set white-space: normal, measure scrollHeight, animate
     - Labels inside .extra-subtasks are excluded from truncation
  */

  function initTaskCardBehaviors(container) {
    container.querySelectorAll(".card").forEach(function (card) {
      var toggle = card.querySelector(".card-expand-toggle");
      if (!toggle) return;

      // Exclude labels inside .extra-subtasks — they're always full-height
      var truncatable = Array.from(
        card.querySelectorAll(".card-contents, .subtask-label"),
      ).filter(function (el) {
        return !el.closest(".extra-subtasks");
      });

      var collapsedHeights = truncatable.map(function (el) {
        var h = el.offsetHeight;
        el.style.height = h + "px";
        return h;
      });

      var moreRow = card.querySelector(".subtask-more");
      var extra = card.querySelector(".extra-subtasks");
      var extraFullHeight = extra ? extra.scrollHeight : 0;

      var expanded = false;

      toggle.addEventListener("click", function () {
        if (expanded) {
          // --- Collapse ---
          truncatable.forEach(function (el, i) {
            el.style.height = collapsedHeights[i] + "px";
            var onEnd = function () {
              el.style.whiteSpace = "nowrap";
              el.removeEventListener("transitionend", onEnd);
            };
            el.addEventListener("transitionend", onEnd);
          });
          if (extra && moreRow) {
            extra.style.height = "0px";
            var onExtraEnd = function () {
              moreRow.style.display = "";
              extra.removeEventListener("transitionend", onExtraEnd);
            };
            extra.addEventListener("transitionend", onExtraEnd);
          }
          toggle.classList.remove("ti-chevron-up");
          toggle.classList.add("ti-chevron-down");
          expanded = false;
        } else {
          // --- Expand ---
          truncatable.forEach(function (el, i) {
            el.style.whiteSpace = "normal";
            var fullHeight = el.scrollHeight;
            el.style.height = collapsedHeights[i] + "px";
            requestAnimationFrame(function () {
              el.style.height = fullHeight + "px";
            });
          });
          if (extra && moreRow) {
            moreRow.style.display = "none";
            requestAnimationFrame(function () {
              extra.style.height = extraFullHeight + "px";
            });
          }
          toggle.classList.remove("ti-chevron-down");
          toggle.classList.add("ti-chevron-up");
          expanded = true;
        }
      });
    });
  }

  function initNotifBehaviors(container) {
    container.querySelectorAll(".notif-card").forEach(function (card) {
      var chevron = card.querySelector(".notif-chevron");
      var contents = card.querySelector(".notif-contents");
      if (!chevron || !contents) return;

      var collapsedHeight = contents.offsetHeight;
      contents.style.height = collapsedHeight + "px";
      var expanded = false;

      chevron.addEventListener("click", function () {
        if (expanded) {
          contents.style.height = collapsedHeight + "px";
          chevron.style.transform = "rotate(0deg)";
          var onEnd = function () {
            contents.style.whiteSpace = "nowrap";
            contents.removeEventListener("transitionend", onEnd);
          };
          contents.addEventListener("transitionend", onEnd);
          expanded = false;
        } else {
          contents.style.whiteSpace = "normal";
          var fullHeight = contents.scrollHeight;
          contents.style.height = collapsedHeight + "px";
          chevron.style.transform = "rotate(180deg)";
          requestAnimationFrame(function () {
            contents.style.height = fullHeight + "px";
          });
          expanded = true;
        }
      });
    });
  }

  /* ---------- Saved screens rendering ---------- */

  function renderSavedTasks(filter) {
    var body = document.querySelector(".saved-tasks-body");
    if (!body) return;
    var items = AppData.savedTasks.filter(function (item) {
      return item.status === filter;
    });
    if (items.length === 0) {
      body.innerHTML = '<div class="saved-empty">No ' + filter + " tasks</div>";
    } else {
      body.innerHTML = items.map(taskCardHTML).join("");
      initTaskCardBehaviors(body);
    }
    updateNavBadges();
  }

  function renderSavedKeep(filter) {
    var body = document.querySelector(".saved-keep-body");
    if (!body) return;
    var items = AppData.savedKeep.filter(function (item) {
      return item.status === filter;
    });
    if (items.length === 0) {
      body.innerHTML = '<div class="saved-empty">No ' + filter + " items</div>";
    } else {
      body.innerHTML = items.map(taskCardHTML).join("");
      initTaskCardBehaviors(body);
    }
    updateNavBadges();
  }

  /* ---------- Nav badge + drawer counts ----------
     Badges mean "needs attention", not raw totals:
       home  (red)   — unread notifications
       tasks (blue)  — new + updated tasks
       keep  (green) — new keep items
  */

  function updateNavBadges() {
    var counts = DataHelpers.getNewCounts();
    var badges = {
      home: UIState.dashboard.summaryDismissed ? 0 : AppData.notifications.length,
      tasks: counts.tasks + DataHelpers.getUpdatedTasks().length,
      keep: counts.keep,
    };

    Object.keys(badges).forEach(function (key) {
      var el = document.querySelector('.nav-badge[data-badge="' + key + '"]');
      if (!el) return;
      var count = badges[key];
      if (count > 0) {
        el.textContent = count > 99 ? "99+" : count;
        el.hidden = false;
      } else {
        el.hidden = true;
      }
    });

    // Drawer category counts
    ["primary", "social"].forEach(function (cat) {
      var el = document.querySelector('[data-drawer-count="' + cat + '"]');
      if (!el) return;
      var n = DataHelpers.getNotifsByCategory(cat).length;
      el.textContent = n > 0 ? n : "";
    });
  }

  /* ---------- Public API ---------- */

  return {
    dashboard: renderDashboard,
    category: renderCategory,
    editScreen: renderEditScreen,
    editSubtasks: renderEditSubtasks,
    savedTasks: renderSavedTasks,
    savedKeep: renderSavedKeep,
    navBadges: updateNavBadges,
  };
})();
