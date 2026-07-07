/* ============================================================
   app.js — Event handling and behavior wiring
   ============================================================
   Uses AppData / UIState / DataHelpers (data.js) and Render (render.js).

   Sections:
     1. Initial render + navigation helpers
     2. Screen switching (bottom tabs)
     3. Edit screen open / close / save
     4. Delegated card interactions (checkbox, edit, delete)
     4b. Dashboard interactions (digest, chips, activity, pinned)
     5. Delegated edit-screen interactions (add/delete subtask, state toggle, checkbox)
     8. Edit-screen dropdowns
     9. Bottom-bar auto-hide
     10. Textarea auto-resize
     11. Filter chips
     12. Drawer
   ============================================================ */

(function () {
  var container = document.querySelector(".screen-container");
  var screens = document.querySelectorAll(".screen");
  var bottomBar = document.querySelector(".bottom-bar");
  var tabs = document.querySelectorAll(".nav-tab");

  /* ========== 1. Initial render + navigation helpers ========== */
  Render.dashboard();

  // Renders the content that belongs to a screen. Called on every
  // navigation because hidden screens can't be measured for the
  // expand/collapse animations (offsetHeight is 0 while hidden).
  function renderScreenContent(name) {
    if (name === "home") {
      Render.dashboard();
    } else if (name === "tasks") {
      Render.savedTasks(UIState.filters.tasks);
    } else if (name === "keep") {
      Render.savedKeep(UIState.filters.keep);
    } else if (name === "primary" || name === "social") {
      Render.category(name);
    }
  }

  // Screens that live in the bottom tab bar; every other screen is
  // drawer-only and hides the bottom bar
  var tabScreenNames = ["home", "tasks", "keep"];

  function navigateTo(name) {
    showScreen(name);
    renderScreenContent(name);
    container.scrollTop = 0;
    if (tabScreenNames.indexOf(name) !== -1) {
      bottomBar.style.display = "";
      bottomBar.classList.remove("hidden");
    } else {
      bottomBar.style.display = "none";
    }
    updateDrawerActive(name);
  }

  /* ========== 2. Screen switching ========== */

  function showScreen(name) {
    UIState.activeScreen = name;
    screens.forEach(function (s) {
      s.hidden = s.dataset.screen !== name;
    });
    // Only highlight bottom tabs for the 3 main screens
    tabs.forEach(function (t) {
      t.classList.toggle("active", t.dataset.target === name);
    });
  }

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      navigateTo(tab.dataset.target);
    });
  });

  /* ========== 3. Edit screen open / close / save ========== */

  function isSavedSection(section) {
    return section === "savedTasks" || section === "savedKeep";
  }

  function openEditScreen(section, id) {
    UIState.previousScreen = UIState.activeScreen;
    UIState.editing = { section: section, id: id };
    Render.editScreen(section, id);

    // Opening the item counts as seeing its LLM updates — clears the
    // amber "Updated" chip and the dashboard activity entry
    var item = DataHelpers.find(section, id);
    if (item && item.updates) {
      item.updates.forEach(function (u) {
        u.seen = true;
      });
      delete UIState.dashboard.openActivity[id];
    }

    // Hide confirm button for already-saved cards (state chips stay visible)
    var saved = isSavedSection(section);
    var confirmBtnEl = document.querySelector(".confirm-btn");
    if (confirmBtnEl) confirmBtnEl.style.display = saved ? "none" : "";

    screens.forEach(function (s) {
      s.hidden = s.dataset.screen !== "edit-task";
    });
    bottomBar.style.display = "none";
    container.scrollTop = 0;
  }

  function closeEditScreen() {
    saveEditChanges();
    UIState.editing = null;

    // navigateTo re-renders the screen we return to, so a card that
    // moved between savedTasks ↔ savedKeep shows up in the right place
    navigateTo(UIState.previousScreen);
    Render.navBadges();
  }

  function saveEditChanges() {
    var editing = UIState.editing;
    if (!editing) return;

    var item = DataHelpers.find(editing.section, editing.id);
    if (!item) return;

    // Title
    var titleEl = document.querySelector(".edit-title");
    item.title = (titleEl.textContent || "").trim() || "Untitled";

    // Description
    var textarea = document.querySelector(".description-area");
    if (textarea) item.contents = textarea.value.trim();

    // Date / time
    var dateInput = document.querySelector('.notion-body input[type="date"]');
    var timeInput = document.querySelector('.notion-body input[type="time"]');
    if (dateInput) item.date = dateInput.value;
    if (timeInput) item.time = timeInput.value;

    // Subtasks — read from DOM
    var rows = document.querySelectorAll(".edit-subtask-row");
    item.subtasks = Array.from(rows)
      .map(function (row) {
        var input = row.querySelector("input");
        var icon = row.querySelector("i.ti-square, i.ti-square-check");
        return {
          id: row.dataset.subtaskId || DataHelpers.generateId("st"),
          label: input ? input.value.trim() : "",
          checked: icon ? icon.classList.contains("ti-square-check") : false,
        };
      })
      .filter(function (st) {
        return st.label !== "";
      });

    DataHelpers.refreshVisibleCount(item);

    // State toggle — may move item between sections
    if (!isSavedSection(editing.section)) {
      var activeChip = document.querySelector(".state-chip.active");
      var newState = activeChip ? activeChip.dataset.state : item.state;
      var targetSection = DataHelpers.stateToSection(newState);

      if (targetSection !== editing.section) {
        DataHelpers.remove(editing.section, editing.id);
        item.state = newState;
        AppData[targetSection].push(item);
      }
    } else {
      // Saved card — move between savedTasks ↔ savedKeep if chip changed
      var activeChip = document.querySelector(".state-chip.active");
      var newState = activeChip ? activeChip.dataset.state : item.state;
      var targetSaved = DataHelpers.stateToSavedSection(newState);

      if (targetSaved !== editing.section) {
        DataHelpers.remove(editing.section, editing.id);
        item.state = newState;
        item.status = newState === "task" ? "active" : "saved";
        AppData[targetSaved].push(item);
        editing.section = targetSaved;
      }
    }
  }

  // Back button
  var backBtn = document.querySelector(".edit-header .back-btn");
  if (backBtn) {
    backBtn.addEventListener("click", function () {
      closeEditScreen();
    });
  }

  // Toast helper
  var toastEl = document.querySelector(".toast");
  var toastTimer = null;

  function showToast(destination) {
    if (!toastEl) return;
    clearTimeout(toastTimer);

    const accent = destination === "Tasks" ? "#3B82F6" : "#22C55E";
    toastEl.style.setProperty("--toast-accent", accent);
    toastEl.innerHTML = `
      <i class="ti ti-circle-check toast-icon"></i>
      <span class="toast-text">Moved to <span class="toast-destination">${destination}</span></span>
    `;
    toastEl.hidden = false;
    void toastEl.offsetHeight;
    toastEl.classList.add("show");

    toastTimer = setTimeout(function () {
      toastEl.classList.remove("show");
      setTimeout(function () {
        toastEl.hidden = true;
      }, 250);
    }, 1800);
  }

  // Confirm button
  var confirmBtn = document.querySelector(".confirm-btn");
  if (confirmBtn) {
    confirmBtn.addEventListener("click", function () {
      var editing = UIState.editing;
      if (!editing) return;

      // Save current edits first
      saveEditChanges();

      // Determine which state chip is active
      var activeChip = document.querySelector(".state-chip.active");
      var newState = activeChip ? activeChip.dataset.state : "task";
      var label = newState === "task" ? "Tasks" : "Keep";

      // After saveEditChanges, the card may have moved between New sections
      // (tasks ↔ keep), so look it up in the section it now lives in
      var currentSection = DataHelpers.stateToSection(newState);

      // Animate the checkmark
      confirmBtn.classList.add("confirmed");
      setTimeout(function () {
        confirmBtn.classList.remove("confirmed");
      }, 400);

      // Confirm: remove from New, push to saved array
      DataHelpers.confirmItem(currentSection, editing.id, newState);

      // Show toast
      showToast(label);

      // Close edit screen after a short delay so user sees the feedback
      setTimeout(function () {
        UIState.editing = null;
        navigateTo(UIState.previousScreen);
        Render.navBadges();
      }, 600);
    });
  }

  /* ========== 4. Delegated card interactions ========== */
  /*
     Event delegation on screen-container means these handlers work with
     dynamically rendered cards — no need to re-attach after re-render.

     Cards on both New and Saved screens carry a [data-source] attribute
     on their container, matching an AppData key (tasks, keep, savedTasks,
     savedKeep). The handler walks up from the clicked icon to find it.
  */

  function findCardSource(card) {
    var sourceEl = card.closest("[data-source]");
    return sourceEl ? sourceEl.dataset.source : null;
  }

  container.addEventListener("click", function (e) {
    // --- Edit trigger (pencil icon on task/keep card) ---
    if (e.target.closest(".edit-task-trigger")) {
      e.stopPropagation();
      var card = e.target.closest(".card");
      var source = card && findCardSource(card);
      if (card && source) {
        openEditScreen(source, card.dataset.itemId);
      }
      return;
    }

    // --- Card delete trigger (trash icon on task/keep card) ---
    if (e.target.closest(".card-delete-trigger")) {
      e.stopPropagation();
      var card = e.target.closest(".card");
      var source = card && findCardSource(card);
      if (card && source) {
        DataHelpers.remove(source, card.dataset.itemId);
        // Re-render the appropriate screen
        if (source === "savedTasks") {
          Render.savedTasks(UIState.filters.tasks);
        } else if (source === "savedKeep") {
          Render.savedKeep(UIState.filters.keep);
        }
      }
      return;
    }

    // --- Checkbox toggle on card view (not edit screen) ---
    var cbIcon = e.target.closest(
      ".subtask-row i.ti-square, .subtask-row i.ti-square-check",
    );
    if (cbIcon && !cbIcon.closest(".edit-subtask-row")) {
      var stId = cbIcon.dataset.subtaskId;
      if (stId) {
        // Toggle visual
        cbIcon.classList.toggle("ti-square");
        cbIcon.classList.toggle("ti-square-check");
        // Toggle data (search all sections)
        var st =
          DataHelpers.findSubtask("tasks", stId) ||
          DataHelpers.findSubtask("keep", stId) ||
          DataHelpers.findSubtask("savedTasks", stId) ||
          DataHelpers.findSubtask("savedKeep", stId);
        if (st) st.checked = !st.checked;
      }
      return;
    }
  });

  /* ========== 4b. Dashboard interactions ========== */

  function dismissSummary() {
    var bodyInner = document.querySelector(".digest-body-inner");
    var digestBody = document.querySelector(".digest-body");
    var cluster = document.querySelector(".digest-icon-cluster");
    var sub = document.querySelector(".digest-sub");

    if (!bodyInner || !digestBody) return;

    // Phase 1: fade out current content + icon cluster
    bodyInner.classList.add("fading-out");
    if (cluster) cluster.classList.add("fading-out");

    setTimeout(function () {
      // Update state
      UIState.dashboard.summaryDismissed = true;

      // Phase 2: swap content to caught-up message
      bodyInner.innerHTML =
        '<div class="digest-caught-up">' +
        '<i class="ti ti-circle-check digest-caught-up-icon"></i>' +
        '<span class="digest-caught-up-text">You\'re all caught up</span>' +
        "</div>";

      // Replace icon cluster with a single green checkmark
      if (cluster) {
        cluster.innerHTML =
          '<span class="cluster-logo" style="background: #22c55e;">' +
          '<i class="ti ti-check"></i>' +
          "</span>";
        cluster.classList.remove("fading-out");
      }

      // Update subtitle
      if (sub) sub.textContent = "No new notifications";

      // Phase 3: fade in new content
      bodyInner.classList.remove("fading-out");
      bodyInner.classList.add("fading-in");

      // Animate height to fit the smaller caught-up content
      digestBody.style.height = digestBody.scrollHeight + "px";
      // After measuring, recalc with new content
      requestAnimationFrame(function () {
        digestBody.style.height = bodyInner.scrollHeight + "px";
        var onEnd = function () {
          digestBody.style.height = "auto";
          digestBody.removeEventListener("transitionend", onEnd);
          bodyInner.classList.remove("fading-in");
        };
        digestBody.addEventListener("transitionend", onEnd);
      });

      // Hide chevron, disable toggle
      var digestCard = document.querySelector(".digest-card");
      if (digestCard) digestCard.classList.add("dismissed-state");

      Render.navBadges();
    }, 250); // matches the fade-out duration
  }

  container.addEventListener("click", function (e) {
    // --- Summary digest expand / collapse ---
    if (e.target.closest(".digest-header")) {
      // When dismissed, keep the card open (no toggle)
      if (UIState.dashboard.summaryDismissed) return;

      var digestCard = document.querySelector(".digest-card");
      var digestBody = document.querySelector(".digest-body");
      if (!digestCard || !digestBody) return;

      var open = !UIState.dashboard.summaryExpanded;
      UIState.dashboard.summaryExpanded = open;
      digestCard.classList.toggle("open", open);

      if (open) {
        digestBody.style.height = digestBody.scrollHeight + "px";
        var onEnd = function () {
          digestBody.style.height = "auto";
          digestBody.removeEventListener("transitionend", onEnd);
        };
        digestBody.addEventListener("transitionend", onEnd);
      } else {
        digestBody.style.height = digestBody.scrollHeight + "px";
        void digestBody.offsetHeight; // force reflow
        digestBody.style.height = "0px";
      }
      return;
    }

    // --- "View all" inside the digest → Primary category screen ---
    if (e.target.closest(".digest-view-all")) {
      navigateTo("primary");
      return;
    }

    // --- Dismiss all notifications in digest ---
    if (e.target.closest(".digest-dismiss")) {
      dismissSummary();
      return;
    }

    // --- New-item count chips → Tasks / Keep tab ---
    var goChip = e.target.closest(".new-chip");
    if (goChip) {
      navigateTo(goChip.dataset.goto);
      return;
    }

    // --- Activity entry head → expand / collapse the diff ---
    var head = e.target.closest(".activity-head");
    if (head) {
      var entry = head.closest(".activity-entry");
      var diff = entry.querySelector(".activity-diff");
      var isOpen = entry.classList.toggle("open");
      diff.hidden = !isOpen;
      UIState.dashboard.openActivity[entry.dataset.itemId] = isOpen;
      return;
    }

    // --- "Open task" inside a diff → edit screen ---
    var openBtn = e.target.closest(".activity-open-btn");
    if (openBtn) {
      var openEntry = openBtn.closest(".activity-entry");
      openEditScreen(openEntry.dataset.source, openEntry.dataset.itemId);
      return;
    }

    // --- Pinned mini-card → edit screen ---
    var mini = e.target.closest(".mini-card");
    if (mini) {
      openEditScreen(mini.dataset.source, mini.dataset.itemId);
      return;
    }

    // --- What's new toggle (switch between original / redesign) ---
    if (e.target.closest(".whats-new-toggle")) {
      var d = UIState.dashboard;
      d.whatsNewVariant =
        d.whatsNewVariant === "original" ? "redesign" : "original";
      Render.dashboard();
      return;
    }

    // --- Redesign: carousel arrows ---
    var arrow = e.target.closest(".wn-arrow");
    if (arrow && !arrow.classList.contains("disabled")) {
      var carousel = arrow.dataset.carousel;
      var dir = arrow.dataset.dir;
      if (carousel === "new") {
        UIState.dashboard.newItemIndex += dir === "next" ? 1 : -1;
      } else if (carousel === "update") {
        UIState.dashboard.updateIndex += dir === "next" ? 1 : -1;
      }
      Render.dashboard();
      return;
    }

    // --- Redesign: approve new item ---
    var approveBtn = e.target.closest(".wn-btn-approve");
    if (approveBtn) {
      var itemId = approveBtn.dataset.itemId;
      var source = approveBtn.dataset.source;
      var item = DataHelpers.find(source, itemId);
      if (item) {
        item.isNew = false;
        // Clamp carousel index
        var newItems = DataHelpers.getNewItems();
        if (UIState.dashboard.newItemIndex >= newItems.length) {
          UIState.dashboard.newItemIndex = Math.max(0, newItems.length - 1);
        }
        var label = source === "savedTasks" ? "Tasks" : "Keep";
        showToast(label);
        Render.dashboard();
        Render.navBadges();
      }
      return;
    }

    // --- Redesign: edit new item ---
    var editBtn = e.target.closest(".wn-btn-edit");
    if (editBtn) {
      openEditScreen(editBtn.dataset.source, editBtn.dataset.itemId);
      return;
    }

    // --- Redesign: discard new item ---
    var discardBtn = e.target.closest(".wn-btn-discard");
    if (discardBtn) {
      DataHelpers.remove(discardBtn.dataset.source, discardBtn.dataset.itemId);
      var newItems = DataHelpers.getNewItems();
      if (UIState.dashboard.newItemIndex >= newItems.length) {
        UIState.dashboard.newItemIndex = Math.max(0, newItems.length - 1);
      }
      Render.dashboard();
      Render.navBadges();
      return;
    }

    // --- Redesign: expand/collapse update card chevron ---
    var updChevron = e.target.closest(".wn-upd-chevron");
    if (updChevron) {
      var card = updChevron.closest(".wn-card");
      var id = card.dataset.itemId;
      UIState.dashboard.openUpdateCard[id] =
        !UIState.dashboard.openUpdateCard[id];
      Render.dashboard();
      return;
    }
    // Also allow clicking the header row to toggle
    var updHeader = e.target.closest(".wn-upd-header");
    if (updHeader && !e.target.closest(".wn-upd-chevron")) {
      var card = updHeader.closest(".wn-card");
      if (card && card.classList.contains("wn-card-top-update")) {
        var id = card.dataset.itemId;
        UIState.dashboard.openUpdateCard[id] =
          !UIState.dashboard.openUpdateCard[id];
        Render.dashboard();
        return;
      }
    }

    // --- Redesign: view task from update card ---
    var viewBtn = e.target.closest(".wn-btn-view");
    if (viewBtn) {
      openEditScreen(viewBtn.dataset.source, viewBtn.dataset.itemId);
      return;
    }

    // --- Redesign: dismiss update ---
    var dismissBtn = e.target.closest(".wn-btn-dismiss");
    if (dismissBtn) {
      var item = DataHelpers.find(
        dismissBtn.dataset.source,
        dismissBtn.dataset.itemId,
      );
      if (item && item.updates) {
        item.updates.forEach(function (u) {
          u.seen = true;
        });
        delete UIState.dashboard.openUpdateCard[dismissBtn.dataset.itemId];
        var updated = DataHelpers.getUpdatedTasks();
        if (UIState.dashboard.updateIndex >= updated.length) {
          UIState.dashboard.updateIndex = Math.max(0, updated.length - 1);
        }
        Render.dashboard();
        Render.navBadges();
      }
      return;
    }
  });

  /* ========== 5. Delegated edit-screen interactions ========== */

  container.addEventListener("click", function (e) {
    // --- Add subtask ---
    if (e.target.closest(".add-subtask-btn")) {
      e.preventDefault();
      var editing = UIState.editing;
      if (!editing) return;
      var item = DataHelpers.find(editing.section, editing.id);
      if (!item) return;

      // Snapshot current DOM state into data before adding
      snapshotEditSubtasks(item);

      item.subtasks.push({
        id: DataHelpers.generateId("st"),
        label: "",
        checked: false,
      });

      Render.editSubtasks(item.subtasks);

      // Focus the new empty input
      var allRows = document.querySelectorAll(".edit-subtask-row");
      var lastInput = allRows[allRows.length - 1];
      if (lastInput) lastInput.querySelector("input").focus();
      return;
    }

    // --- Delete subtask ---
    if (e.target.closest(".delete-subtask")) {
      var row = e.target.closest(".edit-subtask-row");
      if (row) row.remove();
      return;
    }

    // --- State toggle chips ---
    var chip = e.target.closest(".state-chip");
    if (chip) {
      document.querySelectorAll(".state-chip").forEach(function (c) {
        c.classList.remove("active");
      });
      chip.classList.add("active");
      return;
    }

    // --- Edit-screen checkbox toggle ---
    var editCb = e.target.closest(
      ".edit-subtask-row i.ti-square, .edit-subtask-row i.ti-square-check",
    );
    if (editCb) {
      editCb.classList.toggle("ti-square");
      editCb.classList.toggle("ti-square-check");
      return;
    }
  });

  // Read the current subtask inputs from the edit screen DOM into the data item,
  // so we don't lose in-progress edits when re-rendering (e.g. after "Add Sub-task").
  function snapshotEditSubtasks(item) {
    var rows = document.querySelectorAll(".edit-subtask-row");
    item.subtasks = Array.from(rows).map(function (row) {
      var input = row.querySelector("input");
      var icon = row.querySelector("i.ti-square, i.ti-square-check");
      return {
        id: row.dataset.subtaskId || DataHelpers.generateId("st"),
        label: input ? input.value : "",
        checked: icon ? icon.classList.contains("ti-square-check") : false,
      };
    });
  }

  /* ========== 6. Section collapse / expand ========== */

  document
    .querySelectorAll(".section-collapse-toggle")
    .forEach(function (toggle) {
      var sectionEl = toggle.closest(".card-section");
      var key = sectionEl.dataset.section;
      var body = sectionEl.querySelector(".section-body");
      var icon = toggle.querySelector("i");

      toggle.addEventListener("click", function () {
        var uiSec = UIState.sections[key];
        if (!uiSec) return;

        if (uiSec.collapsed) {
          // Expand
          var target = body.scrollHeight;
          body.style.height = target + "px";
          var onEnd = function () {
            body.style.height = "";
            body.removeEventListener("transitionend", onEnd);
          };
          body.addEventListener("transitionend", onEnd);
          icon.classList.remove("ti-chevron-down");
          icon.classList.add("ti-chevron-up");
          uiSec.collapsed = false;
        } else {
          // Collapse
          body.style.height = body.scrollHeight + "px";
          void body.offsetHeight; // force reflow
          body.style.height = "0px";
          icon.classList.remove("ti-chevron-up");
          icon.classList.add("ti-chevron-down");
          uiSec.collapsed = true;
        }
      });
    });

  /* ========== 7. Section overflow menus ========== */

  var openDropdown = null;

  document
    .querySelectorAll(".section-menu-trigger")
    .forEach(function (trigger) {
      var dropdown = trigger.parentElement.querySelector(".section-dropdown");

      trigger.addEventListener("click", function (e) {
        e.stopPropagation();
        if (openDropdown && openDropdown !== dropdown) {
          openDropdown.hidden = true;
        }
        dropdown.hidden = !dropdown.hidden;
        openDropdown = dropdown.hidden ? null : dropdown;
      });

      dropdown.addEventListener("click", function (e) {
        e.stopPropagation();
      });
    });

  /* ========== 7b. Delete all notifications ========== */

  (function () {
    var btn = document.querySelector(".delete-all-notifs-btn");
    if (!btn) return;

    btn.addEventListener("click", function () {
      AppData.notifications.length = 0;
      Render.dashboard();
      Render.navBadges();
    });
  })();

  /* ========== 8. Edit-screen dropdowns ========== */

  function wireDropdown(triggerSel, dropdownSel) {
    var trigger = document.querySelector(triggerSel);
    var dd = document.querySelector(dropdownSel);
    if (!trigger || !dd) return;
    trigger.addEventListener("click", function (e) {
      e.stopPropagation();
      dd.hidden = !dd.hidden;
    });
  }
  wireDropdown(".edit-more-trigger", ".edit-dropdown");
  wireDropdown(".cal-export-trigger", ".cal-dropdown");

  // Close all dropdowns on outside click
  document.addEventListener("click", function () {
    if (openDropdown) {
      openDropdown.hidden = true;
      openDropdown = null;
    }
    var editDD = document.querySelector(".edit-dropdown");
    var calDD = document.querySelector(".cal-dropdown");
    if (editDD) editDD.hidden = true;
    if (calDD) calDD.hidden = true;
  });

  /* ========== 9. Bottom-bar auto-hide ========== */

  (function () {
    var lastScrollTop = 0;
    var ticking = false;

    container.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var cur = container.scrollTop;
        var delta = cur - lastScrollTop;
        if (cur < 20) {
          bottomBar.classList.remove("hidden");
        } else if (delta > 10) {
          bottomBar.classList.add("hidden");
        } else if (delta < -10) {
          bottomBar.classList.remove("hidden");
        }
        lastScrollTop = cur;
        ticking = false;
      });
    });
  })();

  /* ========== 10. Textarea auto-resize ========== */

  container.addEventListener("input", function (e) {
    if (e.target.classList.contains("description-area")) {
      e.target.style.height = "auto";
      e.target.style.height = e.target.scrollHeight + "px";
    }
  });

  /* ========== 11. Filter chips (Tasks / Keep screens) ========== */

  container.addEventListener("click", function (e) {
    var chip = e.target.closest(".filter-chip");
    if (!chip) return;

    var row = chip.closest(".filter-chip-row");
    if (!row) return;

    // Toggle active chip in this row
    row.querySelectorAll(".filter-chip").forEach(function (c) {
      c.classList.remove("active");
    });
    chip.classList.add("active");

    var filterSection = row.dataset.filterSection;
    var filterValue = chip.dataset.filter;

    if (filterSection === "tasks") {
      UIState.filters.tasks = filterValue;
      Render.savedTasks(filterValue);
    } else if (filterSection === "keep") {
      UIState.filters.keep = filterValue;
      Render.savedKeep(filterValue);
    }
  });

  /* ========== 12. Drawer (hamburger menu) ========== */

  var drawer = document.querySelector(".drawer");
  var drawerOverlay = document.querySelector(".drawer-overlay");
  var hamburger = document.querySelector(
    '.top-bar .chrome-icon[aria-label="Menu"]',
  );
  var drawerItems = document.querySelectorAll(".drawer-item");

  function openDrawer() {
    drawer.classList.add("open");
    drawerOverlay.classList.add("visible");
  }

  function closeDrawer() {
    drawer.classList.remove("open");
    drawerOverlay.classList.remove("visible");
  }

  function updateDrawerActive(screenName) {
    drawerItems.forEach(function (item) {
      item.classList.toggle("active", item.dataset.target === screenName);
    });
  }

  // Open on hamburger click
  if (hamburger) {
    hamburger.addEventListener("click", function (e) {
      e.stopPropagation();
      openDrawer();
    });
  }

  // Close on overlay click
  drawerOverlay.addEventListener("click", function () {
    closeDrawer();
  });

  // Navigate on drawer item click
  drawerItems.forEach(function (item) {
    item.addEventListener("click", function () {
      navigateTo(item.dataset.target);
      closeDrawer();
    });
  });

  // Keep drawer active state in sync with tab navigation
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      updateDrawerActive(tab.dataset.target);
    });
  });

  // Initialize drawer active state
  updateDrawerActive(UIState.activeScreen);

  // --- Swipe to close ---
  (function () {
    var startX = 0;
    var currentX = 0;
    var dragging = false;
    var SWIPE_THRESHOLD = 60;

    drawer.addEventListener("touchstart", function (e) {
      startX = e.touches[0].clientX;
      currentX = startX;
      dragging = true;
      drawer.style.transition = "none";
    });

    drawer.addEventListener("touchmove", function (e) {
      if (!dragging) return;
      currentX = e.touches[0].clientX;
      var dx = currentX - startX;
      if (dx < 0) {
        drawer.style.transform = "translateX(" + dx + "px)";
        drawerOverlay.style.opacity = Math.max(0, 1 + dx / 280);
      }
    });

    drawer.addEventListener("touchend", function () {
      if (!dragging) return;
      dragging = false;
      drawer.style.transition = "";
      drawerOverlay.style.opacity = "";

      var dx = currentX - startX;
      if (dx < -SWIPE_THRESHOLD) {
        closeDrawer();
      } else {
        drawer.style.transform = "";
      }
    });
  })();

  // --- Swipe from left edge to open ---
  (function () {
    var startX = 0;
    var currentX = 0;
    var edgeDrag = false;
    var EDGE_ZONE = 24;
    var SWIPE_THRESHOLD = 60;
    var viewport = document.querySelector(".app-viewport");

    viewport.addEventListener("touchstart", function (e) {
      var touch = e.touches[0];
      var rect = viewport.getBoundingClientRect();
      if (
        touch.clientX - rect.left < EDGE_ZONE &&
        !drawer.classList.contains("open")
      ) {
        startX = touch.clientX;
        currentX = startX;
        edgeDrag = true;
        drawer.style.transition = "none";
        drawerOverlay.style.transition = "none";
      }
    });

    viewport.addEventListener("touchmove", function (e) {
      if (!edgeDrag) return;
      currentX = e.touches[0].clientX;
      var dx = Math.max(0, Math.min(280, currentX - startX));
      drawer.style.transform = "translateX(" + (dx - 280) + "px)";
      drawerOverlay.style.opacity = dx / 280;
      drawerOverlay.style.pointerEvents = "auto";
    });

    viewport.addEventListener("touchend", function () {
      if (!edgeDrag) return;
      edgeDrag = false;
      drawer.style.transition = "";
      drawerOverlay.style.transition = "";

      var dx = currentX - startX;
      if (dx > SWIPE_THRESHOLD) {
        openDrawer();
      } else {
        drawer.style.transform = "";
        drawerOverlay.style.opacity = "";
        drawerOverlay.style.pointerEvents = "";
      }
    });
  })();
})();

/* ========== Version Switcher (outside IIFE) ========== */
const versionSwitcherToggle = document.getElementById("versionSwitcherToggle");
const versionMenu = document.getElementById("versionMenu");

if (versionSwitcherToggle && versionMenu) {
  versionSwitcherToggle.addEventListener("click", (event) => {
    event.stopPropagation();

    const isOpen = !versionMenu.hidden;
    versionMenu.hidden = isOpen;
    versionSwitcherToggle.setAttribute("aria-expanded", String(!isOpen));
  });

  document.addEventListener("click", () => {
    versionMenu.hidden = true;
    versionSwitcherToggle.setAttribute("aria-expanded", "false");
  });

  versionMenu.addEventListener("click", (event) => {
    event.stopPropagation();
  });
}

/* ========== Theme toggle (outside IIFE) ========== */
(function () {
  var toggle = document.getElementById("themeToggle");
  if (!toggle) return;

  toggle.addEventListener("click", function () {
    var isDark = document.body.getAttribute("data-theme") === "dark";
    if (isDark) {
      document.body.removeAttribute("data-theme");
    } else {
      document.body.setAttribute("data-theme", "dark");
    }
  });
})();
