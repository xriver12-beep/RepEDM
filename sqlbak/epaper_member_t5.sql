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
-- 表的結構 `epaper_member_t5`
--

CREATE TABLE IF NOT EXISTS `epaper_member_t5` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(32) NOT NULL DEFAULT '',
  `orders` int(11) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=MyISAM  DEFAULT CHARSET=utf8mb4 AUTO_INCREMENT=29 ;

--
-- 轉存資料表中的資料 `epaper_member_t5`
--

INSERT INTO `epaper_member_t5` (`id`, `name`, `orders`) VALUES
(23, '軟體合約已到期', 1),
(24, '軟體合約', 0),
(25, '軟硬合約已到期', 5),
(26, '軟硬合約', 4),
(27, '硬體合約已到期', 3),
(28, '硬體合約', 2);

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
