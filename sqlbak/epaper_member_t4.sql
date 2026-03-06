-- phpMyAdmin SQL Dump
-- version 3.4.10.1deb1
-- http://www.phpmyadmin.net
--
-- 主機: edm.winton.com.tw
-- 產生日期: 2025 年 10 月 25 日 08:39
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
-- 表的結構 `epaper_member_t4`
--

CREATE TABLE IF NOT EXISTS `epaper_member_t4` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(32) NOT NULL DEFAULT '',
  `orders` int(11) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=MyISAM  DEFAULT CHARSET=utf8mb4 AUTO_INCREMENT=158 ;

--
-- 轉存資料表中的資料 `epaper_member_t4`
--

INSERT INTO `epaper_member_t4` (`id`, `name`, `orders`) VALUES
(147, '北區桃園', 10),
(148, '台北營業處', 11),
(149, '南區台南', 12),
(150, '南區高雄', 13),
(131, '醫療', 5),
(130, '業務', 2),
(120, '維修', 3),
(129, '企劃', 7),
(122, '訓二', 1),
(123, '訓一', 0),
(124, '訓練', 4),
(125, '總務', 6),
(128, '管理', 9),
(127, '研發', 8),
(151, '訓三', 14),
(152, '北區新竹', 15),
(153, '總公司', 16),
(154, '中區營業處', 17),
(155, '廈門', 18),
(156, '上海', 19),
(157, '東筦', 20);

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
