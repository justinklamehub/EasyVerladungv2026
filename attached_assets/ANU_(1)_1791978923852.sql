-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: localhost
-- Erstellungszeit: 14. Okt 2026 um 11:34
-- Server-Version: 10.11.18-MariaDB-0+deb12u1
-- PHP-Version: 8.2.33

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Datenbank: `ANU`
--

-- --------------------------------------------------------

--
-- Tabellenstruktur für Tabelle `anwesenheit`
--

CREATE TABLE `anwesenheit` (
  `id` int(11) NOT NULL,
  `vorname` varchar(128) NOT NULL,
  `nachname` varchar(128) NOT NULL,
  `mitarbeiterid` varchar(128) NOT NULL,
  `time_begin` bigint(20) NOT NULL,
  `time_end` bigint(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_german2_ci;

--
-- Daten für Tabelle `anwesenheit`
--

INSERT INTO `anwesenheit` (`id`, `vorname`, `nachname`, `mitarbeiterid`, `time_begin`, `time_end`) VALUES
(28, 'Pascal Bringfried', 'Becher', 'M26000001', 1773035100, 1773068400),
(29, 'Pascal Bringfried', 'Becher', 'M26000001', 1773121500, 1773154800),
(30, 'Pascal Bringfried', 'Becher', 'M26000001', 1773207900, 1773241200),
(31, 'Pascal Bringfried', 'Becher', 'M26000001', 1773294300, 1773327600),
(33, 'Pascal Bringfried', 'Becher', 'M26000001', 1773380700, 1773403200),
(34, 'Pascal Bringfried', 'Becher', 'M26000001', 1773639900, 1773673200),
(35, 'Pascal Bringfried', 'Becher', 'M26000001', 1772785800, 1772798400),
(36, 'Pascal Bringfried', 'Becher', 'M26000001', 1773726300, 1773759600),
(37, 'Santino', 'Balke', 'M26000002', 1773726300, 1773759600),
(38, 'Pascal Bringfried', 'Becher', 'M26000001', 1773812700, 1773846000),
(39, 'Santino', 'Balke', 'M26000002', 1773812700, 1773846000),
(40, 'Pascal Bringfried', 'Becher', 'M26000001', 1773899100, 1773932400),
(41, 'Santino', 'Balke', 'M26000002', 1773899100, 1773932400),
(42, 'Pascal Bringfried', 'Becher', 'M26000001', 1773985500, 1774008000),
(43, 'Santino', 'Balke', 'M26000002', 1773985500, 1774008000),
(44, 'Santino', 'Balke', 'M26000002', 1774247100, 1774278000),
(45, 'Pascal Bringfried', 'Becher', 'M26000001', 1774331100, 1774339200),
(46, 'Santino', 'Balke', 'M26000002', 1774331100, 1774364400),
(47, 'Santino', 'Balke', 'M26000002', 1774417500, 1774450800),
(48, 'Pascal Bringfried', 'Becher', 'M26000001', 1774503900, 1774515420),
(49, 'Santino', 'Balke', 'M26000002', 1774503900, 1774533600),
(50, 'Pascal Bringfried', 'Becher', 'M26000001', 1774525440, 1774537200),
(51, 'Pascal Bringfried', 'Becher', 'M26000001', 1774590300, 1774612800),
(52, 'Santino', 'Balke', 'M26000002', 1774590300, 1774612800),
(53, 'Pascal Bringfried', 'Becher', 'M26000001', 1774845900, 1774879200),
(54, 'Pascal Bringfried', 'Becher', 'M26000001', 1774932300, 1774965600),
(55, 'Santino', 'Balke', 'M26000002', 1774932300, 1774965600),
(56, 'Santino', 'Balke', 'M26000002', 1775018700, 1775052000),
(57, 'Heiko', 'Plöger', 'M26000003', 1775018700, 1775052000),
(58, 'Santino', 'Balke', 'M26000002', 1775105100, 1775138400),
(59, 'Heiko', 'Plöger', 'M26000003', 1775105100, 1775138400),
(60, 'Santino', 'Balke', 'M26000002', 1775537100, 1775570400),
(61, 'Heiko', 'Plöger', 'M26000003', 1775537100, 1775570400),
(62, 'Santino', 'Balke', 'M26000002', 1775623500, 1775644200),
(63, 'Heiko', 'Plöger', 'M26000003', 1775623500, 1775656800),
(64, 'Santino', 'Balke', 'M26000002', 1775709900, 1775743200),
(65, 'Heiko', 'Plöger', 'M26000003', 1775709900, 1775743200),
(66, 'Santino', 'Balke', 'M26000002', 1775796300, 1775818800),
(67, 'Heiko', 'Plöger', 'M26000003', 1775796300, 1775818800),
(68, 'Santino', 'Balke', 'M26000002', 1776055500, 1776081600),
(70, 'Heiko', 'Plöger', 'M26000003', 1776055500, 1776088852),
(71, 'Heiko', 'Plöger', 'M26000003', 1776141900, 1776175200),
(72, 'Santino', 'Balke', 'M26000002', 1776144000, 1776175200),
(74, 'Heiko', 'Plöger', 'M26000003', 1776228300, 1776261600),
(75, 'Santino', 'Balke', 'M26000002', 1776231000, 1776261600),
(76, 'Santino', 'Balke', 'M26000002', 1776314700, 1776348000),
(77, 'Santino', 'Balke', 'M26000002', 1776402240, 1776423600),
(78, 'Santino', 'Balke', 'M26000002', 1776660300, 1776693600),
(79, 'Heiko', 'Plöger', 'M26000003', 1776660300, 1776693600),
(80, 'Santino', 'Balke', 'M26000002', 1776746700, 1776780000),
(81, 'Heiko', 'Plöger', 'M26000003', 1776746756, 1776780000),
(82, 'Santino', 'Balke', 'M26000002', 1776833100, 1776866400),
(83, 'Heiko', 'Plöger', 'M26000003', 1776833100, 1776866400),
(84, 'Santino', 'Balke', 'M26000002', 1776919500, 1776952800),
(85, 'Heiko', 'Plöger', 'M26000003', 1776919500, 1776952800),
(86, 'Heiko', 'Plöger', 'M26000003', 1777005900, 1777028400),
(87, 'Santino', 'Balke', 'M26000002', 1777005900, 1777028400),
(90, 'Heiko', 'Plöger', 'M26000003', 1777351500, 1777384800),
(91, 'Santino', 'Balke', 'M26000002', 1777353780, 1777384800),
(92, 'Santino', 'Balke', 'M26000002', 1777437900, 1777471200),
(93, 'Heiko', 'Plöger', 'M26000003', 1777437900, 1777471200),
(94, 'Santino', 'Balke', 'M26000002', 1777524300, 1777557600),
(95, 'Heiko', 'Plöger', 'M26000003', 1777524300, 1777557600),
(96, 'Santino', 'Balke', 'M26000002', 1777869900, 1777903200),
(97, 'Heiko', 'Plöger', 'M26000003', 1777869900, 1777903200),
(98, 'Santino', 'Balke', 'M26000002', 1777265100, 1777298400),
(99, 'Heiko', 'Plöger', 'M26000003', 1777265100, 1777298400),
(100, 'Heiko', 'Plöger', 'M26000003', 1777956300, 1777989600),
(101, 'Santino', 'Balke', 'M26000002', 1777956307, 1777989600),
(102, 'Heiko', 'Plöger', 'M26000003', 1778042700, 1778076000),
(103, 'Santino', 'Balke', 'M26000002', 1778042700, 1778076000),
(104, 'Heiko', 'Plöger', 'M26000003', 1778129100, 1778162400),
(105, 'Santino', 'Balke', 'M26000002', 1778129584, 1778162400),
(106, 'Heiko', 'Plöger', 'M26000003', 1778215500, 1778238000),
(107, 'Santino', 'Balke', 'M26000002', 1778215500, 1778238000),
(108, 'Heiko', 'Plöger', 'M26000003', 1778474700, 1778508000),
(109, 'Heiko', 'Plöger', 'M26000003', 1778561100, 1778594400),
(110, 'Heiko', 'Plöger', 'M26000003', 1778647500, 1778680800),
(112, 'Santino', 'Balke', 'M26000002', 1779079500, 1779112800),
(113, 'Santino', 'Balke', 'M26000002', 1779165900, 1779199200),
(114, 'Heiko', 'Plöger', 'M26000003', 1779165900, 1779199200),
(115, 'Heiko', 'Plöger', 'M26000003', 1779252300, 1779285600),
(116, 'Santino', 'Balke', 'M26000002', 1779338700, 1779372000),
(117, 'Heiko', 'Plöger', 'M26000003', 1779338700, 1779372000),
(118, 'Heiko', 'Plöger', 'M26000003', 1779425100, 1779447600),
(119, 'Santino', 'Balke', 'M26000002', 1779428091, 1779447600),
(120, 'Heiko', 'Plöger', 'M26000003', 1779770700, 1779780720),
(121, 'Santino', 'Balke', 'M26000002', 1779857100, 1779890400),
(122, 'Santino', 'Balke', 'M26000002', 1779943500, 1779976800),
(123, 'Santino', 'Balke', 'M26000002', 1780031100, 1780052400),
(124, 'Heiko', 'Plöger', 'M26000003', 1780289100, 1780322400),
(125, 'Heiko', 'Plöger', 'M26000003', 1780375500, 1780408800),
(126, 'Heiko', 'Plöger', 'M26000003', 1780461900, 1780495200),
(127, 'Heiko', 'Plöger', 'M26000003', 1780548300, 1780581600),
(128, 'Heiko', 'Plöger', 'M26000003', 1780634700, 1780650918),
(129, 'Santino', 'Balke', 'M26000002', 1780893900, 1780927200),
(130, 'Heiko', 'Plöger', 'M26000003', 1780893900, 1780927200),
(131, 'Heiko', 'Plöger', 'M26000003', 1780980300, 1781013600),
(132, 'Santino', 'Balke', 'M26000002', 1780981602, 1781013600),
(133, 'Heiko', 'Plöger', 'M26000003', 1781066700, 1781100000),
(134, 'Santino', 'Balke', 'M26000002', 1781069781, 1781100000),
(135, 'Heiko', 'Plöger', 'M26000003', 1781153100, 1781186400),
(136, 'Santino', 'Balke', 'M26000002', 1781239500, 1781262000),
(137, 'Heiko', 'Plöger', 'M26000003', 1781239500, 1781262000),
(138, 'Santino', 'Balke', 'M26000002', 1781498700, 1781532000),
(139, 'Heiko', 'Plöger', 'M26000003', 1781498700, 1781532000),
(140, 'Santino', 'Balke', 'M26000002', 1781585100, 1781618400),
(141, 'Heiko', 'Plöger', 'M26000003', 1781585100, 1781618400),
(142, 'Santino', 'Balke', 'M26000002', 1781671500, 1781704800),
(143, 'Heiko', 'Plöger', 'M26000003', 1781671500, 1781704800),
(144, 'Santino', 'Balke', 'M26000002', 1781844300, 1781866800),
(145, 'Santino', 'Balke', 'M26000002', 1782103500, 1782136800),
(146, 'Heiko', 'Plöger', 'M26000003', 1782103500, 1782136800),
(147, 'Heiko', 'Plöger', 'M26000003', 1782276300, 1782309600),
(148, 'Heiko', 'Plöger', 'M26000003', 1782362700, 1782396000),
(149, 'Santino', 'Balke', 'M26000002', 1782189900, 1782223200),
(150, 'Heiko', 'Plöger', 'M26000003', 1782449100, 1782471600),
(151, 'Santino', 'Balke', 'M26000002', 1782449433, 1782471600),
(152, 'Heiko', 'Plöger', 'M26000003', 1782708300, 1782741600),
(153, 'Hamza', 'Aydogan', 'M26000005', 1791175500, 1791208800),
(154, 'Benjamin', 'Kniesche', 'M26000013', 1791175500, 1791208800),
(155, 'Emre', 'Aslan', 'M26000024', 1791175500, 1791208800),
(156, 'Mert', 'Erciez', 'M26000017', 1791175500, 1791208800),
(157, 'Konstantin', 'Erdyniev', 'M26000007', 1791175500, 1791208800),
(158, 'Heiko', 'Plöger', 'M26000003', 1791175500, 1791208800),
(159, 'Mario', 'Prem', 'M26000012', 1791175500, 1791208800),
(160, 'Dennis', 'Turbanow', 'M26000011', 1791175500, 1791208800),
(161, 'Rogger', 'Wiederstried', 'M26000006', 1791175500, 1791208800),
(162, 'Benjamin', 'Kniesche', 'M26000013', 1791261900, 1791295200),
(163, 'Mario', 'Prem', 'M26000012', 1791261900, 1791295200),
(164, 'Hamza', 'Aydogan', 'M26000005', 1791261900, 1791295200),
(165, 'Emre', 'Aslan', 'M26000024', 1791261900, 1791295200),
(166, 'Mert', 'Erciez', 'M26000017', 1791261900, 1791295200),
(167, 'Konstantin', 'Erdyniev', 'M26000007', 1791261900, 1791295200),
(168, 'Heiko', 'Plöger', 'M26000003', 1791261900, 1791295200),
(169, 'Dennis', 'Turbanow', 'M26000011', 1791261900, 1791295200),
(170, 'Rogger', 'Wiederstried', 'M26000006', 1791261900, 1791295200),
(171, 'Rogger', 'Wiederstried', 'M26000006', 1791348300, 1791381600),
(172, 'Benjamin', 'Kniesche', 'M26000013', 1791348300, 1791381600),
(173, 'Mario', 'Prem', 'M26000012', 1791348300, 1791381600),
(174, 'Mert', 'Erciez', 'M26000017', 1791348300, 1791381600),
(175, 'Heiko', 'Plöger', 'M26000003', 1791348300, 1791381600),
(176, 'Hamza', 'Aydogan', 'M26000005', 1791348300, 1791381600),
(177, 'Emre', 'Aslan', 'M26000024', 1791348300, 1791381600),
(178, 'Konstantin', 'Erdyniev', 'M26000007', 1791348300, 1791381600),
(179, 'Dennis', 'Turbanow', 'M26000011', 1791348300, 1791381600),
(180, 'Benjamin', 'Kniesche', 'M26000013', 1791434700, 1791468000),
(181, 'Rogger', 'Wiederstried', 'M26000006', 1791434700, 1791468000),
(182, 'Mario', 'Prem', 'M26000012', 1791434700, 1791468000),
(183, 'Heiko', 'Plöger', 'M26000003', 1791434700, 1791468000),
(184, 'Emre', 'Aslan', 'M26000024', 1791434700, 1791468000),
(185, 'Hamza', 'Aydogan', 'M26000005', 1791434700, 1791468000),
(186, 'Konstantin', 'Erdyniev', 'M26000007', 1791434700, 1791468000),
(188, 'Dennis', 'Turbanow', 'M26000011', 1791434700, 1791468000),
(189, 'Mario', 'Prem', 'M26000012', 1791521100, 1791543600),
(190, 'Benjamin', 'Kniesche', 'M26000013', 1791521100, 1791543654),
(191, 'Dennis', 'Turbanow', 'M26000011', 1791521100, 1791536708),
(192, 'Rogger', 'Wiederstried', 'M26000006', 1791521100, 1791543600),
(193, 'Heiko', 'Plöger', 'M26000003', 1791521100, 1791543600),
(194, 'Konstantin', 'Erdyniev', 'M26000007', 1791521100, 1791543600),
(195, 'Hamza', 'Aydogan', 'M26000005', 1791521100, 1791543600),
(196, 'Emre', 'Aslan', 'M26000024', 1791521100, 1791543600),
(197, 'Hamza', 'Aydogan', 'M26000005', 1791780300, 1791813600),
(199, 'Benjamin', 'Kniesche', 'M26000013', 1791780300, 1791813600),
(200, 'Dennis', 'Turbanow', 'M26000011', 1791780300, 1791813600),
(201, 'Rogger', 'Wiederstried', 'M26000006', 1791780300, 1791813600),
(202, 'Mario', 'Prem', 'M26000012', 1791780300, 1791813600),
(203, 'Emre', 'Aslan', 'M26000024', 1791780300, 1791813600),
(204, 'Benjamin', 'Kniesche', 'M26000013', 1791866700, 1791900000),
(205, 'Rogger', 'Wiederstried', 'M26000006', 1791866700, 1791900000),
(206, 'Mario', 'Prem', 'M26000012', 1791866700, 1791900000),
(208, 'Dennis', 'Turbanow', 'M26000011', 1791866700, 1791900000),
(209, 'Hamza', 'Aydogan', 'M26000005', 1791866700, 1791900000),
(211, 'Benjamin', 'Kniesche', 'M26000013', 1791953100, NULL),
(213, 'Mario', 'Prem', 'M26000012', 1791953100, NULL),
(214, 'Rogger', 'Wiederstried', 'M26000006', 1791953100, NULL),
(215, 'Dennis', 'Turbanow', 'M26000011', 1791953100, NULL),
(216, 'Heiko', 'Plöger', 'M26000003', 1791953100, NULL),
(217, 'Hamza', 'Aydogan', 'M26000005', 1791953100, NULL),
(218, 'Emre', 'Aslan', 'M26000024', 1791953100, NULL);

-- --------------------------------------------------------

--
-- Tabellenstruktur für Tabelle `mitarbeiter`
--

CREATE TABLE `mitarbeiter` (
  `id` int(11) NOT NULL,
  `vorname` varchar(128) NOT NULL COMMENT 'Vorname des Mitarbeiters',
  `nachname` varchar(128) NOT NULL COMMENT 'Nachname des Mitarbeiters',
  `mitarbeiterid` varchar(128) NOT NULL COMMENT 'Automatisch generierter CODE!',
  `tatigkeit` varchar(128) NOT NULL,
  `dienstleister` varchar(128) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_german2_ci;

--
-- Daten für Tabelle `mitarbeiter`
--

INSERT INTO `mitarbeiter` (`id`, `vorname`, `nachname`, `mitarbeiterid`, `tatigkeit`, `dienstleister`) VALUES
(0, 'Justin', 'Klame', 'JK01', 'Administrator', 'COMET Feuerwerk GmbH'),
(11, 'Heiko', 'Plöger', 'M26000003', 'Staplerfahrer', 'Office People'),
(12, 'Franco', 'Mauro', 'M26000004', 'Staplerfahrer', 'Office People'),
(13, 'Hamza', 'Aydogan', 'M26000005', 'Staplerfahrer', 'Office People'),
(14, 'Rogger', 'Wiederstried', 'M26000006', 'Staplerfahrer', 'Office People'),
(15, 'Konstantin', 'Erdyniev', 'M26000007', 'Staplerfahrer', 'Office People'),
(19, 'Dennis', 'Turbanow', 'M26000011', 'Staplerfahrer', 'SMM'),
(20, 'Mario', 'Prem', 'M26000012', 'Staplerfahrer', 'Alpha Consult KG'),
(21, 'Benjamin', 'Kniesche', 'M26000013', 'Staplerfahrer', 'Office People'),
(23, 'Besljim', 'Krasnic', 'M26000015', 'Staplerfahrer', 'Office People'),
(25, 'Mert', 'Erciez', 'M26000017', 'Staplerfahrer', 'Office People'),
(26, 'Dennis', 'Klemm', 'M26000018', 'Staplerfahrer', 'Alpha Consult KG'),
(27, 'Pascal', 'Hoppe', 'M26000019', 'Staplerfahrer', 'Alpha Consult KG'),
(28, 'Syuleyman', 'Nedzhibov', 'M26000020', 'Staplerfahrer', 'Persotec'),
(30, 'Mohammad', 'Abdelkader', 'M26000022', 'Staplerfahrer', 'Persotec'),
(31, 'David', 'Hester', 'M26000023', 'Staplerfahrer', 'Office People'),
(32, 'Emre', 'Aslan', 'M26000024', 'Staplerfahrer', 'Alpha Consult KG'),
(35, 'Pierre', 'Von Gahlen', 'M26000025', 'SF', 'Persotec'),
(36, 'Manuel', 'Schlößer', 'M26000026', 'Staplerfahrer', 'Office People'),
(37, 'Ihor', 'Solohub', 'M26000027', 'Staplerfahrer', 'Office People'),
(38, 'Attila', 'Dioszegi-Bonder', 'M26000028', 'Staplerfahrer', 'Office People'),
(39, 'Sefa Hamza', 'Kaynar', 'M26000029', 'Staplerfahrer', 'Office People');

--
-- Indizes der exportierten Tabellen
--

--
-- Indizes für die Tabelle `anwesenheit`
--
ALTER TABLE `anwesenheit`
  ADD PRIMARY KEY (`id`);

--
-- Indizes für die Tabelle `mitarbeiter`
--
ALTER TABLE `mitarbeiter`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_mitarbeiterid` (`mitarbeiterid`);

--
-- AUTO_INCREMENT für exportierte Tabellen
--

--
-- AUTO_INCREMENT für Tabelle `anwesenheit`
--
ALTER TABLE `anwesenheit`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=219;

--
-- AUTO_INCREMENT für Tabelle `mitarbeiter`
--
ALTER TABLE `mitarbeiter`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=40;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
