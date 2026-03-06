-- phpMyAdmin SQL Dump
-- version 3.4.10.1deb1
-- http://www.phpmyadmin.net
--
-- 主機: edm.winton.com.tw
-- 產生日期: 2025 年 10 月 25 日 08:40
-- 伺服器版本: 5.5.40
-- PHP 版本: 5.3.10-1ubuntu3.15

SET SQL_MODE="NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;

--
-- 資料庫: `epaper`
--

-- --------------------------------------------------------

--
-- 表的結構 `epaper_member_t6`
--

CREATE TABLE IF NOT EXISTS `epaper_member_t6` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(32) NOT NULL DEFAULT '',
  `orders` int(11) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=MyISAM  DEFAULT CHARSET=utf8mb4 AUTO_INCREMENT=342 ;

--
-- 轉存資料表中的資料 `epaper_member_t6`
--

INSERT INTO `epaper_member_t6` (`id`, `name`, `orders`) VALUES
(20, 'MERP', 2),
(10, 'WSTP2000', 0),
(80, 'WHIS', 9),
(30, 'WHRS', 4),
(40, 'WSTF2000', 5),
(50, 'WBEC2000', 6),
(336, 'e-HRS', 28),
(335, 'WCPA', 27),
(11, 'WSTP-DOS', 1),
(21, 'WMIS-DOS', 3),
(70, 'ERP', 10),
(51, 'WBEC-DOS', 7),
(334, 'WEBPOS', 26),
(333, 'WEIT', 25),
(332, 'WPDA', 24),
(331, 'CERP', 23),
(324, 'APOS', 17),
(337, 'NBAK', 29),
(338, 'WHRS', 30),
(329, 'MERP-DOS', 22),
(339, 'WFTS', 31),
(340, 'WSCS', 32),
(341, 'W_BAK', 33);

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
