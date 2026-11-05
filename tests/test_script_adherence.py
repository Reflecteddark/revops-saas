"""The script-adherence core: only the manager's words count, endings do not matter, quotes are the manager's own."""

from apps.api.services.methodology_defaults import CRITERIA_IDS, DEFAULT_MODULES, NOT_SCRIPTED, STAGES, criterion_title
from apps.api.services.script_adherence import evaluate_module, has_manager_speech, parse_turns

CALL = """[00:03] Менеджер: Добрый день! Меня зовут Иван, компания Ромашка.
[00:09] Клиент: Здравствуйте.
[00:12] Менеджер: Звоню по поводу автоматизации отдела продаж, вам удобно сейчас?
[00:20] Клиент: Да, слушаю.
[00:25] Менеджер: Подскажите, кто кроме вас
участвует в решении по такому вопросу?
Клиент: Директор и финансист.
"""


def test_parse_turns_labels_timestamps_and_continuation():
    turns = parse_turns(CALL)
    assert [t.speaker for t in turns] == ["manager", "client", "manager", "client", "manager", "client"]
    assert turns[0].ts == 3 and turns[2].ts == 12
    assert turns[4].text.endswith("участвует в решении по такому вопросу?"), "a line without a label continues the turn"
    assert turns[5].ts is None


def test_manager_label_by_the_managers_first_name():
    turns = parse_turns("Надежда: Добрый день, меня зовут Надежда.\nКлиент: Привет.", manager_name="Надежда Петрова")
    assert [t.speaker for t in turns] == ["manager", "client"]
    assert has_manager_speech(turns)
    assert not has_manager_speech(parse_turns("Анна: Добрый день.\nБорис: Здравствуйте."))


def test_anchor_is_met_by_the_manager_and_the_quote_is_his_own_turn():
    turns = parse_turns(CALL)
    res = evaluate_module(["меня зовут | это говорит", "компания | организация"], [], 2, turns)
    assert res.adhered and len(res.matched) == 2
    assert res.quote == "Добрый день! Меня зовут Иван, компания Ромашка."
    assert res.ts == 3


def test_words_of_the_client_never_count():
    turns = parse_turns("Менеджер: Здравствуйте.\nКлиент: Меня зовут Пётр, я из компании Ромашка.")
    res = evaluate_module(["меня зовут", "компания"], [], 1, turns)
    assert not res.adhered and res.matched == [] and res.quote is None


def test_word_endings_do_not_matter():
    turns = parse_turns("Менеджер: Мы позвонили вам вчера, обсуждали окупаемость решений.")
    assert evaluate_module(["окупается | окупаемость | окупится"], [], 1, turns).adhered
    assert not evaluate_module(["скидка | рассрочка"], [], 1, turns).adhered


def test_alternatives_need_most_of_their_words_in_one_place():
    turns = parse_turns("Менеджер: Давайте посчитаем эффект.\nКлиент: Хорошо.\nМенеджер: Потом отправлю письмо.")
    assert evaluate_module(["давайте зафиксируем встречу"], [], 1, turns).adhered is False  # 1 of 3 words
    assert evaluate_module(["давайте посчитаем сумму"], [], 1, turns).adhered is True  # 2 of 3 words


def test_two_neighbouring_manager_turns_make_one_window():
    turns = parse_turns("Менеджер: Предлагаю зафиксировать\nКлиент: Угу.\nМенеджер: встречу на четверг")
    assert evaluate_module(["предлагаю зафиксировать встречу четверг"], [], 1, turns).adhered


def test_stop_phrase_of_the_manager_fails_the_module():
    turns = parse_turns("Менеджер: Я могу дать скидку прямо сейчас.\nКлиент: Отлично.")
    res = evaluate_module([], ["могу дать скидку"], 0, turns)
    assert not res.adhered and res.banned == ["могу дать скидку"]
    assert res.quote == "Я могу дать скидку прямо сейчас."


def test_stop_phrase_said_by_the_client_is_ignored():
    turns = parse_turns("Менеджер: Давайте обсудим условия.\nКлиент: А можете дать скидку?")
    assert evaluate_module([], ["дать скидку"], 0, turns).adhered


def test_stop_phrase_needs_the_words_in_a_row():
    turns = parse_turns("Менеджер: Это как-то бы странно вышло, и скидку дать мы не можем.")
    assert evaluate_module([], ["как бы"], 0, turns).adhered
    assert not evaluate_module([], ["скидку дать"], 0, turns).adhered


def test_required_count_is_never_more_than_the_anchors_there_are():
    turns = parse_turns("Менеджер: Меня зовут Иван.")
    assert evaluate_module(["меня зовут"], [], 3, turns).adhered  # 3 asked, 1 exists: the module is still satisfiable
    assert not evaluate_module(["меня зовут", "компания"], [], 2, turns).adhered


def test_defaults_are_neutral_and_usable():
    assert {m["target_criterion"] for m in DEFAULT_MODULES} == set(CRITERIA_IDS) - NOT_SCRIPTED
    assert len(DEFAULT_MODULES) == 12
    for m in DEFAULT_MODULES:
        text = " ".join([m["recommended_speech"], m["stage_name"], *m["semantic_anchors"], *m["banned_triggers"]])
        assert "RevOps" not in text and "тысяч рублей в месяц" not in text, m["target_criterion"]
        assert m["stage_name"] == STAGES[m["target_criterion"]]
        assert 0 <= m["min_anchors_required"] <= len(m["semantic_anchors"])
        assert m["semantic_anchors"] or m["banned_triggers"], "a module that checks nothing is a stub"
    assert criterion_title("cr9") == "Приветствие и регламент"  # the audit's name, from one source


def test_default_greeting_module_recognises_a_real_greeting_and_default_filler_module_a_filler():
    mods = {m["target_criterion"]: m for m in DEFAULT_MODULES}
    greeting = mods["cr9"]
    res = evaluate_module(greeting["semantic_anchors"], greeting["banned_triggers"], greeting["min_anchors_required"], parse_turns(CALL))
    assert res.adhered, res
    speech = mods["cr10"]
    dirty = parse_turns("Менеджер: Ну, мы, типа, делаем это, как бы, для всех.")
    clean = parse_turns("Менеджер: Мы делаем это для всех отделов продаж.")
    assert not evaluate_module(speech["semantic_anchors"], speech["banned_triggers"], 0, dirty).adhered
    assert evaluate_module(speech["semantic_anchors"], speech["banned_triggers"], 0, clean).adhered
